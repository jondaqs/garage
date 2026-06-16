// src/app/admin/subscriptions/page.js
'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SubscriptionReceiptCard from '@/components/SubscriptionReceiptCard'
import {
    CreditCard, Package, Percent, Gift, Calculator, Users, Building2, Wrench,
    Plus, Save, Trash2, X, CheckCircle, AlertCircle, Loader2, ToggleLeft, ToggleRight,
    ChevronDown, ChevronRight, Search, Filter, Eye, Ban, PlayCircle, RefreshCw,
    ArrowUpRight, ArrowDownRight, Clock, DollarSign, FileText, Zap, Store, Receipt, BadgeCheck, Banknote, Download, Sparkles
} from 'lucide-react'
import Pagination from '@/components/admin/Pagination'
import SaveCustomPlanModal from '@/components/subscription/SaveCustomPlanModal'
import { buildSubscriptionInvoiceHtml } from '@/lib/subscription/buildSubscriptionInvoiceHtml'
import { buildSubscriptionReceiptHtml } from '@/lib/subscription/buildSubscriptionReceiptHtml'
import { downloadHtmlAsPdf } from '@/lib/subscription/downloadHtmlAsPdf'

const TABS = [
    { id: 'overview', label: 'Overview', icon: CreditCard },
    { id: 'list', label: 'Subscriptions', icon: Users },
    { id: 'packages', label: 'Packages', icon: Package },
    { id: 'tiers', label: 'Pricing Tiers', icon: DollarSign },
    { id: 'discounts', label: 'Period Discounts', icon: Percent },
    { id: 'trials', label: 'Trial Config', icon: Gift },
    { id: 'shops', label: 'Shop Tiers', icon: Store },
    { id: 'invoices',  label: 'Invoices',  icon: FileText },
    { id: 'receipts',  label: 'Receipts',  icon: Receipt || CreditCard },
    { id: 'calculator', label: 'Price Calculator', icon: Calculator },
]

const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'

const STATUS_COLORS = {
    active: 'bg-green-100 text-green-800',
    pending_approval: 'bg-yellow-100 text-yellow-800',
    dormant: 'bg-gray-100 text-gray-600',
    suspended: 'bg-red-100 text-red-800',
    blocked: 'bg-red-200 text-red-900',
    expired: 'bg-gray-200 text-gray-600',
    cancelled: 'bg-orange-100 text-orange-800',
}

// ─── Stat Card ──────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color = 'blue', subtext, trend }) {
    const colors = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        yellow: 'bg-yellow-50 text-yellow-600',
        red: 'bg-red-50 text-red-600',
        purple: 'bg-purple-50 text-purple-600',
        gray: 'bg-gray-100 text-gray-600',
    }
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                    {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
                </div>
                <div className={`p-2 rounded-lg ${colors[color]}`}>
                    <Icon size={18} />
                </div>
            </div>
            {trend && (
                <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {trend > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(trend)}% this month
                </div>
            )}
        </div>
    )
}

// ─── Section wrapper ────────────────────────────────────────────
function Section({ title, description, actions, children }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
                    {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
                </div>
                {actions && <div className="flex gap-2">{actions}</div>}
            </div>
            {children}
        </div>
    )
}

// ─── Status badge ───────────────────────────────────────────────
function StatusBadge({ code }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[code] || 'bg-gray-100 text-gray-600'}`}>
            {code?.replace(/_/g, ' ')}
        </span>
    )
}

// ─── Toast ──────────────────────────────────────────────────────
function Toast({ message, type = 'success', onDismiss }) {
    if (!message) return null
    const styles = type === 'success'
        ? 'bg-green-50 border-green-200 text-green-700'
        : 'bg-red-50 border-red-200 text-red-700'
    const Icon = type === 'success' ? CheckCircle : AlertCircle
    return (
        <div className={`mb-4 p-3 border rounded-lg flex items-start gap-2 text-sm ${styles}`}>
            <Icon size={15} className="flex-shrink-0 mt-0.5" />
            <p className="flex-1">{message}</p>
            <button onClick={onDismiss} className="ml-2"><X size={14} /></button>
        </div>
    )
}


// ════════════════════════════════════════════════════════════════
//  OVERVIEW TAB
// ════════════════════════════════════════════════════════════════
function OverviewTab({ supabase }) {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => { loadStats() }, [])

    const loadStats = async () => {
        setLoading(true)
        try {
            const [
                { data: subs },
                { data: invoices },
                { data: payments },
                { data: packages },
                { data: pendingSubs },
            ] = await Promise.all([
                supabase.from('subscription_details').select('id, status_code, is_currently_active, expiry_status, subscriber_type, package_cost, currency_code'),
                supabase.from('subscription_invoice_details').select('id, invoice_status_code, total_amount, effective_status, currency_code'),
                supabase.from('subscription_payments').select('id, amount, date_paid'),
                supabase.from('subscription_packages').select('id, is_active'),
                supabase.from('subscription_details').select('id').eq('status_code', 'pending_approval'),
            ])

            const activeSubs = subs?.filter(s => s.is_currently_active) || []
            const expiringSoon = subs?.filter(s => s.expiry_status === 'expiring_soon') || []
            const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0
            const unpaidInvoices = invoices?.filter(i => i.effective_status === 'unpaid' || i.effective_status === 'overdue') || []
            const overdueInvoices = invoices?.filter(i => i.effective_status === 'overdue') || []
            const outstandingAmount = unpaidInvoices.reduce((sum, i) => sum + Number(i.total_amount || 0), 0)

            const byType = { individual: 0, company: 0, service_provider: 0 }
            activeSubs.forEach(s => { if (byType[s.subscriber_type] !== undefined) byType[s.subscriber_type]++ })

            setStats({
                totalSubs: subs?.length || 0,
                activeSubs: activeSubs.length,
                pendingSubs: pendingSubs?.length || 0,
                expiringSoon: expiringSoon.length,
                totalRevenue,
                activePackages: packages?.filter(p => p.is_active)?.length || 0,
                unpaidInvoices: unpaidInvoices.length,
                overdueInvoices: overdueInvoices.length,
                outstandingAmount,
                byType,
            })
        } catch (e) {
            console.error('Stats error:', e)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={28} /></div>

    if (!stats) return <p className="text-sm text-gray-400 text-center py-8">No data available</p>

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Active subscriptions" value={stats.activeSubs} icon={CheckCircle} color="green" />
                <StatCard label="Pending approval" value={stats.pendingSubs} icon={Clock} color="yellow" />
                <StatCard label="Expiring soon" value={stats.expiringSoon} icon={AlertCircle} color="red" subtext="Within 7 days" />
                <StatCard label="Total revenue" value={`$${stats.totalRevenue.toLocaleString()}`} icon={DollarSign} color="blue" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total subscriptions" value={stats.totalSubs} icon={CreditCard} color="purple" />
                <StatCard label="Active packages" value={stats.activePackages} icon={Package} color="blue" />
                <StatCard label="Unpaid invoices" value={stats.unpaidInvoices} icon={FileText} color="yellow" subtext={`$${stats.outstandingAmount.toLocaleString()} outstanding`} />
                <StatCard label="Overdue invoices" value={stats.overdueInvoices} icon={AlertCircle} color="red" />
            </div>
            <Section title="Active subscriptions by type" description="Distribution across subscriber types">
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <Users size={20} className="mx-auto text-blue-600 mb-1" />
                        <p className="text-2xl font-bold text-blue-900">{stats.byType.individual}</p>
                        <p className="text-xs text-blue-600 font-medium">Individual</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4 text-center">
                        <Building2 size={20} className="mx-auto text-purple-600 mb-1" />
                        <p className="text-2xl font-bold text-purple-900">{stats.byType.company}</p>
                        <p className="text-xs text-purple-600 font-medium">Company</p>
                    </div>
                    <div className="bg-teal-50 rounded-lg p-4 text-center">
                        <Wrench size={20} className="mx-auto text-teal-600 mb-1" />
                        <p className="text-2xl font-bold text-teal-900">{stats.byType.service_provider}</p>
                        <p className="text-xs text-teal-600 font-medium">Service Provider</p>
                    </div>
                </div>
            </Section>
        </div>
    )
}


// ════════════════════════════════════════════════════════════════
//  SUBSCRIPTIONS LIST TAB
// ════════════════════════════════════════════════════════════════
function SubscriptionsListTab({ supabase }) {
    const [subs, setSubs] = useState([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('all')
    const [typeFilter, setTypeFilter] = useState('all')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [acting, setActing] = useState(null)
    const [toast, setToast] = useState({ message: '', type: 'success' })
    const pageSize = 15

    useEffect(() => { loadSubs() }, [statusFilter, typeFilter, page])

    const loadSubs = async () => {
        setLoading(true)
        try {
            let q = supabase.from('subscription_details')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range((page - 1) * pageSize, page * pageSize - 1)

            if (statusFilter !== 'all') q = q.eq('status_code', statusFilter)
            if (typeFilter !== 'all') q = q.eq('subscription_type_code', typeFilter)

            const { data, count, error } = await q
            if (error) throw error
            setSubs(data || [])
            setTotal(count || 0)
        } catch (e) {
            console.error('Load error:', e)
        } finally {
            setLoading(false)
        }
    }

    const doAction = async (subId, action) => {
        setActing(subId)
        try {
            let fn
            if (action === 'approve') fn = 'approve_subscription'
            else if (action === 'suspend') fn = 'suspend_subscription'
            else if (action === 'cancel') fn = 'cancel_subscription'

            const params = { p_subscription_id: subId }
            if (action !== 'approve') params.p_reason = `Admin action: ${action}`

            const { error } = await supabase.rpc(fn, params)
            if (error) throw error

            setToast({ message: `Subscription ${action}d successfully`, type: 'success' })
            setTimeout(() => setToast({ message: '' }), 3000)
            await loadSubs()
        } catch (e) {
            setToast({ message: e.message, type: 'error' })
        } finally {
            setActing(null)
        }
    }

    const filtered = subs.filter(s => {
        if (!search) return true
        const q = search.toLowerCase()
        return (s.subscription_number || '').toLowerCase().includes(q)
            || (s.subscriber_name || '').toLowerCase().includes(q)
            || (s.package_name || '').toLowerCase().includes(q)
    })

    return (
        <div className="space-y-4">
            <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Search by number, name, or package…" value={search}
                        onChange={e => setSearch(e.target.value)}
                        className={inp + ' pl-9'} />
                </div>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                    className={inp + ' w-auto'}>
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="pending_approval">Pending</option>
                    <option value="suspended">Suspended</option>
                    <option value="dormant">Dormant</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="blocked">Blocked</option>
                </select>
                <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
                    className={inp + ' w-auto'}>
                    <option value="all">All types</option>
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                    <option value="service_provider">Service Provider</option>
                </select>
            </div>

            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Number</th>
                                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Subscriber</th>
                                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Package</th>
                                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Expiry</th>
                                    <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Cost</th>
                                    <th className="text-right py-2.5 px-3 w-36" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={8} className="py-8 text-center text-gray-400 text-sm">No subscriptions found</td></tr>
                                ) : filtered.map(s => (
                                    <tr key={s.id} className="hover:bg-gray-50">
                                        <td className="py-2.5 px-3 font-mono text-xs text-gray-700">{s.subscription_number}</td>
                                        <td className="py-2.5 px-3">
                                            <p className="text-gray-900 font-medium text-xs">{s.subscriber_name || '—'}</p>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <span className="text-xs text-gray-500 capitalize">{s.subscriber_type?.replace(/_/g, ' ')}</span>
                                        </td>
                                        <td className="py-2.5 px-3 text-xs text-gray-600">{s.package_name}</td>
                                        <td className="py-2.5 px-3"><StatusBadge code={s.status_code} /></td>
                                        <td className="py-2.5 px-3">
                                            <p className="text-xs text-gray-600">{s.expiry_date}</p>
                                            {s.expiry_status === 'expiring_soon' && (
                                                <p className="text-[10px] text-red-500 font-medium">{s.days_until_expiry}d left</p>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-3 text-xs font-medium text-gray-700">
                                            {s.currency_symbol}{Number(s.package_cost || 0).toLocaleString()}
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {s.status_code === 'pending_approval' && (
                                                    <button onClick={() => doAction(s.id, 'approve')} disabled={acting === s.id}
                                                        className="p-1.5 text-green-700 hover:bg-green-50 rounded disabled:opacity-50" title="Approve">
                                                        {acting === s.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                                    </button>
                                                )}
                                                {['active', 'dormant'].includes(s.status_code) && (
                                                    <button onClick={() => doAction(s.id, 'suspend')} disabled={acting === s.id}
                                                        className="p-1.5 text-yellow-700 hover:bg-yellow-50 rounded disabled:opacity-50" title="Suspend">
                                                        <Ban size={14} />
                                                    </button>
                                                )}
                                                {!['cancelled', 'blocked'].includes(s.status_code) && (
                                                    <button onClick={() => doAction(s.id, 'cancel')} disabled={acting === s.id}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50" title="Cancel">
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} pageSize={pageSize} totalCount={total} onPageChange={setPage} />
                </>
            )}
        </div>
    )
}


// ════════════════════════════════════════════════════════════════
//  PACKAGES TAB
// ════════════════════════════════════════════════════════════════
function PackagesTab({ supabase }) {
    const [packages, setPackages] = useState([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [toast, setToast] = useState({ message: '', type: 'success' })
    const [customFilter, setCustomFilter] = useState('all') // 'all' | 'standard' | 'custom'

    useEffect(() => { loadPackages() }, [])

    const loadPackages = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('subscription_package_listing')
            .select('*')
            .order('subscription_type_code')
            .order('sort_order')
        if (!error) setPackages(data || [])
        setLoading(false)
    }

    const generateBatch = async () => {
        setGenerating(true)
        try {
            const { data, error } = await supabase.rpc('generate_subscription_packages_batch', {
                p_batch_name: 'Admin batch ' + new Date().toISOString().slice(0, 16)
            })
            if (error) throw error
            const result = typeof data === 'string' ? JSON.parse(data) : data
            if (!result.success) throw new Error(result.error)
            setToast({ message: `Generated ${result.packages_created} packages (${result.packages_skipped} skipped)`, type: 'success' })
            setTimeout(() => setToast({ message: '' }), 4000)
            await loadPackages()
        } catch (e) {
            setToast({ message: e.message, type: 'error' })
        } finally {
            setGenerating(false)
        }
    }

    const toggleActive = async (pkg) => {
        const { error } = await supabase.from('subscription_packages').update({ is_active: !pkg.is_active }).eq('id', pkg.id)
        if (error) { setToast({ message: error.message, type: 'error' }); return }
        await loadPackages()
    }

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

    const grouped = packages.reduce((acc, p) => {
        // Apply custom filter
        if (customFilter === 'standard' && p.is_custom) return acc
        if (customFilter === 'custom' && !p.is_custom) return acc
        const key = p.subscription_type_name
        if (!acc[key]) acc[key] = []
        acc[key].push(p)
        return acc
    }, {})

    const customCount = packages.filter(p => p.is_custom).length
    const standardCount = packages.length - customCount

    return (
        <div className="space-y-4">
            <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />

            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-500">{packages.length} packages</p>
                    {customCount > 0 && (
                        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-[11px]">
                            <button onClick={() => setCustomFilter('all')}
                                className={`px-2 py-1 rounded-md transition-colors ${customFilter === 'all' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                                All
                            </button>
                            <button onClick={() => setCustomFilter('standard')}
                                className={`px-2 py-1 rounded-md transition-colors ${customFilter === 'standard' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                                Standard ({standardCount})
                            </button>
                            <button onClick={() => setCustomFilter('custom')}
                                className={`px-2 py-1 rounded-md transition-colors ${customFilter === 'custom' ? 'bg-white shadow text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                                <span className="inline-flex items-center gap-1"><Sparkles size={10} /> Custom ({customCount})</span>
                            </button>
                        </div>
                    )}
                </div>
                <button onClick={generateBatch} disabled={generating}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    Generate from tiers
                </button>
            </div>

            {Object.entries(grouped).map(([typeName, pkgs]) => (
                <Section key={typeName} title={typeName} description={`${pkgs.length} packages`}>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Package</th>
                                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Period</th>
                                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Cost</th>
                                    <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Monthly eq.</th>
                                    <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">Limits</th>
                                    <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">Active</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pkgs.map(p => {
                                    const isFree = Number(p.cost) === 0
                                    const isBasicPlus = (p.name || '').toLowerCase().includes('basic plus')
                                    const features = (() => { try { return typeof p.features === 'string' ? JSON.parse(p.features) : (p.features || []) } catch { return [] } })()
                                    return (
                                    <tr key={p.id} className={`hover:bg-gray-50 ${isFree ? 'bg-green-50/30' : isBasicPlus ? 'bg-blue-50/30' : p.is_custom ? 'bg-purple-50/20' : ''}`}>
                                        <td className="py-2 px-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-gray-900 font-medium text-xs">{p.name}</span>
                                                {isFree && <span className="text-[9px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">FREE</span>}
                                                {isBasicPlus && <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">BASIC PLUS</span>}
                                                {p.is_custom && <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"><Sparkles size={8} />CUSTOM</span>}
                                            </div>
                                            {p.is_custom && p.target_entity_name && (
                                                <p className="text-[10px] text-purple-500 mt-0.5 flex items-center gap-1">
                                                    {p.target_entity_type === 'company' ? <Building2 size={9} /> : <Wrench size={9} />}
                                                    {p.target_entity_name}
                                                </p>
                                            )}
                                            {p.description && !p.is_custom && <p className="text-[10px] text-gray-400 mt-0.5 max-w-[240px] truncate" title={p.description}>{p.description}</p>}
                                            {features.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {features.slice(0, 3).map((f, fi) => (
                                                        <span key={fi} className="text-[9px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{f}</span>
                                                    ))}
                                                    {features.length > 3 && <span className="text-[9px] text-gray-400">+{features.length - 3}</span>}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-2 px-3 text-gray-600 text-xs">{p.billing_period_name}</td>
                                        <td className="py-2 px-3 text-right font-mono text-xs">
                                            {isFree ? <span className="text-green-600 font-semibold">Free</span> : `${p.currency_symbol}${Number(p.cost).toLocaleString()}`}
                                        </td>
                                        <td className="py-2 px-3 text-right text-gray-400 text-xs">
                                            {isFree ? '—' : `${p.currency_symbol}${Number(p.monthly_equivalent_cost).toLocaleString()}/mo`}
                                        </td>
                                        <td className="py-2 px-3 text-center text-xs text-gray-500">
                                            {[
                                                p.max_users && `${p.max_users} users`,
                                                p.max_vehicles && `${p.max_vehicles} vehicles`,
                                                p.max_shops && `${p.max_shops} shops`,
                                            ].filter(Boolean).join(', ') || '—'}
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                            <button onClick={() => toggleActive(p)}>
                                                {p.is_active ? <ToggleRight size={20} className="text-green-600 mx-auto" /> : <ToggleLeft size={20} className="text-gray-400 mx-auto" />}
                                            </button>
                                        </td>
                                    </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </Section>
            ))}
        </div>
    )
}


// ════════════════════════════════════════════════════════════════
//  PRICING TIERS TAB
// ════════════════════════════════════════════════════════════════
function PricingTiersTab({ supabase }) {
    const [tiers, setTiers] = useState([])
    const [types, setTypes] = useState([])
    const [currencies, setCurrencies] = useState([])
    const [loading, setLoading] = useState(true)
    const [editId, setEditId] = useState(null)
    const [editData, setEditData] = useState({})
    const [saving, setSaving] = useState(null)
    const [toast, setToast] = useState({ message: '', type: 'success' })
    const [showCreate, setShowCreate] = useState(false)
    const [creating, setCreating] = useState(false)
    const [customFilter, setCustomFilter] = useState('all') // 'all' | 'standard' | 'custom'
    const [newTier, setNewTier] = useState({
        subscription_type_id: '', tier_code: '', tier_name: '', description: '',
        base_monthly_price: '', min_vehicles: 0, max_vehicles: '',
        min_staff: 0, max_staff: '', min_monthly_clients: 0, max_monthly_clients: '',
        per_extra_vehicle_price: 0, per_extra_staff_price: 0, per_extra_client_price: 0,
        currency_id: '', features_text: '', max_users_included: 1, max_vehicles_included: 1,
        max_shops_included: 0, sort_order: 10, is_active: true, is_upper_limit: false,
    })

    useEffect(() => { loadAll() }, [])

    const loadAll = async () => {
        setLoading(true)
        const [{ data: t }, { data: st }, { data: cur }] = await Promise.all([
            supabase.from('subscription_pricing_tiers').select('*').order('subscription_type_id').order('sort_order'),
            supabase.from('subscription_types').select('id, code, display_name').order('sort_order'),
            supabase.from('currencies').select('id, code, symbol').eq('is_active', true),
        ])
        setTiers(t || [])
        setTypes(st || [])
        setCurrencies(cur || [])
        setLoading(false)
    }

    const getTypeName = (id) => types.find(t => t.id === id)?.display_name || '—'
    const getCurrencyCode = (id) => currencies.find(c => c.id === id)?.code || '—'

    const startEdit = (tier) => {
        setEditId(tier.id)
        setEditData({
            tier_name: tier.tier_name,
            description: tier.description || '',
            base_monthly_price: tier.base_monthly_price,
            per_extra_vehicle_price: tier.per_extra_vehicle_price || 0,
            per_extra_staff_price: tier.per_extra_staff_price || 0,
            per_extra_client_price: tier.per_extra_client_price || 0,
            min_vehicles: tier.min_vehicles, max_vehicles: tier.max_vehicles,
            min_staff: tier.min_staff, max_staff: tier.max_staff,
            min_monthly_clients: tier.min_monthly_clients, max_monthly_clients: tier.max_monthly_clients,
            is_active: tier.is_active,
            is_upper_limit: tier.is_upper_limit,
        })
    }

    const saveEdit = async () => {
        setSaving(editId)
        try {
            const update = { ...editData }
            // Coerce numerics
            for (const k of ['base_monthly_price', 'per_extra_vehicle_price', 'per_extra_staff_price', 'per_extra_client_price',
                'min_vehicles', 'max_vehicles', 'min_staff', 'max_staff', 'min_monthly_clients', 'max_monthly_clients']) {
                update[k] = update[k] === '' || update[k] === null ? null : Number(update[k])
            }
            // description stays as string
            const { error } = await supabase.from('subscription_pricing_tiers').update(update).eq('id', editId)
            if (error) throw error
            setEditId(null)
            setToast({ message: 'Tier updated', type: 'success' })
            setTimeout(() => setToast({ message: '' }), 2500)
            await loadAll()
        } catch (e) {
            setToast({ message: e.message, type: 'error' })
        } finally {
            setSaving(null)
        }
    }

    const toggleTierActive = async (tier) => {
        try {
            const { error } = await supabase.from('subscription_pricing_tiers')
                .update({ is_active: !tier.is_active }).eq('id', tier.id)
            if (error) throw error
            setToast({ message: `Tier "${tier.tier_name}" ${tier.is_active ? 'deactivated — will be skipped during package generation' : 'activated'}`, type: 'success' })
            setTimeout(() => setToast({ message: '' }), 3000)
            await loadAll()
        } catch (e) { setToast({ message: e.message, type: 'error' }) }
    }

    const createTier = async () => {
        if (!newTier.subscription_type_id || !newTier.tier_name || newTier.base_monthly_price === '') {
            setToast({ message: 'Subscription type, tier name, and base price are required', type: 'error' }); return
        }
        setCreating(true)
        try {
            // Auto-generate tier_code from type code + tier name
            const typeCode = types.find(t => t.id === newTier.subscription_type_id)?.code || 'sub'
            const tierCode = newTier.tier_code ||
                (typeCode + '_' + newTier.tier_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''))

            // Parse features from text (one per line)
            const features = newTier.features_text
                ? newTier.features_text.split('\n').map(f => f.trim()).filter(Boolean)
                : []

            const row = {
                subscription_type_id: newTier.subscription_type_id,
                tier_code: tierCode,
                tier_name: newTier.tier_name,
                description: newTier.description || null,
                base_monthly_price: Number(newTier.base_monthly_price),
                min_vehicles: Number(newTier.min_vehicles) || 0,
                max_vehicles: newTier.max_vehicles === '' ? null : Number(newTier.max_vehicles),
                min_staff: Number(newTier.min_staff) || 0,
                max_staff: newTier.max_staff === '' ? null : Number(newTier.max_staff),
                min_monthly_clients: Number(newTier.min_monthly_clients) || 0,
                max_monthly_clients: newTier.max_monthly_clients === '' ? null : Number(newTier.max_monthly_clients),
                per_extra_vehicle_price: Number(newTier.per_extra_vehicle_price) || 0,
                per_extra_staff_price: Number(newTier.per_extra_staff_price) || 0,
                per_extra_client_price: Number(newTier.per_extra_client_price) || 0,
                currency_id: newTier.currency_id || currencies[0]?.id,
                features: JSON.stringify(features),
                max_users_included: Number(newTier.max_users_included) || 1,
                max_vehicles_included: Number(newTier.max_vehicles_included) || 1,
                max_shops_included: Number(newTier.max_shops_included) || 0,
                sort_order: Number(newTier.sort_order) || 10,
                is_active: newTier.is_active,
                is_upper_limit: newTier.is_upper_limit,
            }

            const { error } = await supabase.from('subscription_pricing_tiers').insert(row)
            if (error) throw error
            setShowCreate(false)
            setNewTier(prev => ({ ...prev, tier_name: '', tier_code: '', description: '', base_monthly_price: '', features_text: '' }))
            setToast({ message: `Tier "${row.tier_name}" created! Generate packages to make it available.`, type: 'success' })
            setTimeout(() => setToast({ message: '' }), 4000)
            await loadAll()
        } catch (e) {
            setToast({ message: e.message, type: 'error' })
        } finally {
            setCreating(false)
        }
    }

    const ed = (key, type = 'text') => editId ? (
        <input type={type} value={editData[key] ?? ''} onChange={e => setEditData(d => ({ ...d, [key]: e.target.value }))}
            className={inp + ' py-1 text-xs w-20'} />
    ) : null

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

    const customCount = tiers.filter(t => t.is_custom).length
    const standardCount = tiers.length - customCount

    const grouped = tiers.reduce((acc, t) => {
        if (customFilter === 'standard' && t.is_custom) return acc
        if (customFilter === 'custom' && !t.is_custom) return acc
        const key = getTypeName(t.subscription_type_id)
        if (!acc[key]) acc[key] = []
        acc[key].push(t)
        return acc
    }, {})

    return (
        <div className="space-y-4">
            <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />

            {customCount > 0 && (
                <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-500">{tiers.length} tiers</p>
                    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-[11px]">
                        <button onClick={() => setCustomFilter('all')}
                            className={`px-2 py-1 rounded-md transition-colors ${customFilter === 'all' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                            All
                        </button>
                        <button onClick={() => setCustomFilter('standard')}
                            className={`px-2 py-1 rounded-md transition-colors ${customFilter === 'standard' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                            Standard ({standardCount})
                        </button>
                        <button onClick={() => setCustomFilter('custom')}
                            className={`px-2 py-1 rounded-md transition-colors ${customFilter === 'custom' ? 'bg-white shadow text-purple-700 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                            <span className="inline-flex items-center gap-1"><Sparkles size={10} /> Custom ({customCount})</span>
                        </button>
                    </div>
                </div>
            )}

            {Object.entries(grouped).map(([typeName, tierList]) => (
                <Section key={typeName} title={`${typeName} tiers`} description="Click a row to edit pricing and ranges">

            {/* Add Tier button */}
            <div className="flex justify-between items-center mb-3">
                <div />
                <button onClick={() => { setShowCreate(!showCreate); setEditId(null) }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        showCreate ? 'bg-gray-200 text-gray-700' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                    {showCreate ? <X size={12} /> : <Plus size={12} />}
                    {showCreate ? 'Cancel' : 'Add Tier'}
                </button>
            </div>

            {/* Create Tier Form */}
            {showCreate && (
                <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-sm mb-4">
                    <div className="bg-gray-900 px-4 py-2.5 flex items-center gap-2">
                        <Plus size={13} className="text-blue-400" />
                        <span className="text-white font-semibold text-xs">New Pricing Tier</span>
                    </div>
                    <div className="p-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Type *</label>
                                <select value={newTier.subscription_type_id} onChange={e => setNewTier(d => ({ ...d, subscription_type_id: e.target.value }))} className={inp + ' text-xs'}>
                                    <option value="">Select…</option>
                                    {types.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Tier Name *</label>
                                <input type="text" placeholder="e.g. Premium" value={newTier.tier_name}
                                    onChange={e => setNewTier(d => ({ ...d, tier_name: e.target.value }))} className={inp + ' text-xs'} />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Code (auto)</label>
                                <input type="text" placeholder="Auto" value={newTier.tier_code}
                                    onChange={e => setNewTier(d => ({ ...d, tier_code: e.target.value }))} className={inp + ' text-xs text-gray-400'} />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Description</label>
                            <input type="text" placeholder="Short description" value={newTier.description}
                                onChange={e => setNewTier(d => ({ ...d, description: e.target.value }))} className={inp + ' text-xs'} />
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Base Price/mo *</label>
                                <input type="number" step="0.01" min="0" placeholder="0.00" value={newTier.base_monthly_price}
                                    onChange={e => setNewTier(d => ({ ...d, base_monthly_price: e.target.value }))} className={inp + ' text-xs'} />
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Currency</label>
                                <select value={newTier.currency_id} onChange={e => setNewTier(d => ({ ...d, currency_id: e.target.value }))} className={inp + ' text-xs'}>
                                    <option value="">Default</option>
                                    {currencies.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Sort Order</label>
                                <input type="number" min="1" value={newTier.sort_order}
                                    onChange={e => setNewTier(d => ({ ...d, sort_order: e.target.value }))} className={inp + ' text-xs'} />
                            </div>
                            <div className="flex items-end gap-3 pb-1">
                                <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
                                    <input type="checkbox" checked={newTier.is_active} onChange={e => setNewTier(d => ({ ...d, is_active: e.target.checked }))}
                                        className="w-3 h-3 rounded border-gray-300 text-blue-600" /> Active
                                </label>
                                <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
                                    <input type="checkbox" checked={newTier.is_upper_limit} onChange={e => setNewTier(d => ({ ...d, is_upper_limit: e.target.checked }))}
                                        className="w-3 h-3 rounded border-gray-300 text-blue-600" /> Cap
                                </label>
                            </div>
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Min Veh.</label>
                                <input type="number" min="0" value={newTier.min_vehicles} onChange={e => setNewTier(d => ({ ...d, min_vehicles: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Max Veh.</label>
                                <input type="number" min="0" placeholder="∞" value={newTier.max_vehicles} onChange={e => setNewTier(d => ({ ...d, max_vehicles: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Min Staff</label>
                                <input type="number" min="0" value={newTier.min_staff} onChange={e => setNewTier(d => ({ ...d, min_staff: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Max Staff</label>
                                <input type="number" min="0" placeholder="∞" value={newTier.max_staff} onChange={e => setNewTier(d => ({ ...d, max_staff: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Min Clients</label>
                                <input type="number" min="0" value={newTier.min_monthly_clients} onChange={e => setNewTier(d => ({ ...d, min_monthly_clients: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Max Clients</label>
                                <input type="number" min="0" placeholder="∞" value={newTier.max_monthly_clients} onChange={e => setNewTier(d => ({ ...d, max_monthly_clients: e.target.value }))} className={inp + ' text-xs'} /></div>
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Per Veh.</label>
                                <input type="number" step="0.01" min="0" value={newTier.per_extra_vehicle_price} onChange={e => setNewTier(d => ({ ...d, per_extra_vehicle_price: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Per Staff</label>
                                <input type="number" step="0.01" min="0" value={newTier.per_extra_staff_price} onChange={e => setNewTier(d => ({ ...d, per_extra_staff_price: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Per Client</label>
                                <input type="number" step="0.01" min="0" value={newTier.per_extra_client_price} onChange={e => setNewTier(d => ({ ...d, per_extra_client_price: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Users Incl.</label>
                                <input type="number" min="0" value={newTier.max_users_included} onChange={e => setNewTier(d => ({ ...d, max_users_included: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Vehicles Incl.</label>
                                <input type="number" min="0" value={newTier.max_vehicles_included} onChange={e => setNewTier(d => ({ ...d, max_vehicles_included: e.target.value }))} className={inp + ' text-xs'} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Shops Incl.</label>
                                <input type="number" min="0" value={newTier.max_shops_included} onChange={e => setNewTier(d => ({ ...d, max_shops_included: e.target.value }))} className={inp + ' text-xs'} /></div>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Features (one per line)</label>
                            <textarea rows={3} placeholder={"Budget tracking & limits\nExpense reports\nFull maintenance history"}
                                value={newTier.features_text} onChange={e => setNewTier(d => ({ ...d, features_text: e.target.value }))}
                                className={inp + ' text-xs resize-y'} />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={createTier} disabled={creating}
                                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 disabled:opacity-50">
                                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                {creating ? 'Creating…' : 'Create Tier'}
                            </button>
                            <button onClick={() => setShowCreate(false)} className="px-3 py-2 text-gray-500 text-xs">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Tier</th>
                                    <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Base/mo</th>
                                    <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Vehicles</th>
                                    <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Staff</th>
                                    <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Clients/mo</th>
                                    <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Per vehicle</th>
                                    <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Per staff</th>
                                    <th className="text-right py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Per client</th>
                                    <th className="text-center py-2 px-2 text-[10px] font-medium text-gray-500 uppercase">Cap</th>
                                    <th className="text-right py-2 px-2 w-20" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {tierList.map(t => {
                                    const isEditing = editId === t.id
                                    const isFree = Number(t.base_monthly_price) === 0
                                    const isBasicPlus = (t.tier_code || '').includes('basic_plus')
                                    const features = (() => { try { return typeof t.features === 'string' ? JSON.parse(t.features) : (t.features || []) } catch { return [] } })()
                                    return (
                                        <tr key={t.id} className={`hover:bg-gray-50 cursor-pointer ${isEditing ? 'bg-blue-50' : ''} ${!t.is_active ? 'opacity-50' : ''} ${t.is_custom ? 'bg-purple-50/20' : ''}`}
                                            onClick={() => !isEditing && !t.is_custom && startEdit(t)}>
                                            <td className="py-2 px-2">
                                                <div className="flex items-center gap-1.5">
                                                    <p className="font-medium text-gray-900">{isEditing ? ed('tier_name') : t.tier_name}</p>
                                                    {isFree && <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">FREE</span>}
                                                    {isBasicPlus && <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">BASIC PLUS</span>}
                                                    {t.is_custom && <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"><Sparkles size={8} />CUSTOM</span>}
                                                </div>
                                                <p className="text-[10px] text-gray-400">{t.tier_code}</p>
                                                {t.is_custom && t.target_entity_id && (
                                                    <p className="text-[10px] text-purple-500 mt-0.5 flex items-center gap-1">
                                                        {t.target_entity_type === 'company' ? <Building2 size={9} /> : <Wrench size={9} />}
                                                        {t.notes || t.target_entity_type}
                                                    </p>
                                                )}
                                                {isEditing ? (
                                                    <input type="text" value={editData.description ?? ''} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))}
                                                        className={inp + ' py-1 text-xs mt-1'} placeholder="Description" />
                                                ) : t.description ? (
                                                    <p className="text-[10px] text-gray-400 mt-0.5 max-w-[200px] truncate" title={t.description}>{t.description}</p>
                                                ) : null}
                                                {!isEditing && features.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {features.slice(0, 3).map((f, fi) => (
                                                            <span key={fi} className="text-[9px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{f}</span>
                                                        ))}
                                                        {features.length > 3 && <span className="text-[9px] text-gray-400">+{features.length - 3}</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono">
                                                {isEditing ? ed('base_monthly_price', 'number') : (isFree ? <span className="text-green-600 font-semibold text-xs">Free</span> : `$${Number(t.base_monthly_price).toFixed(2)}`)}
                                            </td>
                                            <td className="py-2 px-2 text-center text-gray-600">
                                                {isEditing ? (
                                                    <div className="flex gap-1 items-center justify-center">
                                                        <input type="number" value={editData.min_vehicles ?? ''} onChange={e => setEditData(d => ({ ...d, min_vehicles: e.target.value }))}
                                                            className={inp + ' py-1 w-12 text-xs text-center'} placeholder="min" />
                                                        <span>–</span>
                                                        <input type="number" value={editData.max_vehicles ?? ''} onChange={e => setEditData(d => ({ ...d, max_vehicles: e.target.value }))}
                                                            className={inp + ' py-1 w-12 text-xs text-center'} placeholder="max" />
                                                    </div>
                                                ) : (
                                                    t.max_vehicles ? `${t.min_vehicles}–${t.max_vehicles}` : t.min_vehicles ? `${t.min_vehicles}+` : '—'
                                                )}
                                            </td>
                                            <td className="py-2 px-2 text-center text-gray-600">
                                                {isEditing ? (
                                                    <div className="flex gap-1 items-center justify-center">
                                                        <input type="number" value={editData.min_staff ?? ''} onChange={e => setEditData(d => ({ ...d, min_staff: e.target.value }))}
                                                            className={inp + ' py-1 w-12 text-xs text-center'} placeholder="min" />
                                                        <span>–</span>
                                                        <input type="number" value={editData.max_staff ?? ''} onChange={e => setEditData(d => ({ ...d, max_staff: e.target.value }))}
                                                            className={inp + ' py-1 w-12 text-xs text-center'} placeholder="max" />
                                                    </div>
                                                ) : (
                                                    t.max_staff ? `${t.min_staff}–${t.max_staff}` : t.min_staff ? `${t.min_staff}+` : '—'
                                                )}
                                            </td>
                                            <td className="py-2 px-2 text-center text-gray-600">
                                                {isEditing ? (
                                                    <div className="flex gap-1 items-center justify-center">
                                                        <input type="number" value={editData.min_monthly_clients ?? ''} onChange={e => setEditData(d => ({ ...d, min_monthly_clients: e.target.value }))}
                                                            className={inp + ' py-1 w-12 text-xs text-center'} placeholder="min" />
                                                        <span>–</span>
                                                        <input type="number" value={editData.max_monthly_clients ?? ''} onChange={e => setEditData(d => ({ ...d, max_monthly_clients: e.target.value }))}
                                                            className={inp + ' py-1 w-12 text-xs text-center'} placeholder="max" />
                                                    </div>
                                                ) : (
                                                    t.max_monthly_clients ? `${t.min_monthly_clients}–${t.max_monthly_clients}` : t.min_monthly_clients ? `${t.min_monthly_clients}+` : '—'
                                                )}
                                            </td>
                                            <td className="py-2 px-2 text-right font-mono">{isEditing ? ed('per_extra_vehicle_price', 'number') : `$${Number(t.per_extra_vehicle_price || 0).toFixed(2)}`}</td>
                                            <td className="py-2 px-2 text-right font-mono">{isEditing ? ed('per_extra_staff_price', 'number') : `$${Number(t.per_extra_staff_price || 0).toFixed(2)}`}</td>
                                            <td className="py-2 px-2 text-right font-mono">{isEditing ? ed('per_extra_client_price', 'number') : `$${Number(t.per_extra_client_price || 0).toFixed(2)}`}</td>
                                            <td className="py-2 px-2 text-center">
                                                {t.is_upper_limit ? <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">FIXED</span> : '—'}
                                            </td>
                                            <td className="py-2 px-2 text-right" onClick={e => e.stopPropagation()}>
                                                {isEditing ? (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={saveEdit} disabled={saving === editId}
                                                            className="p-1.5 text-green-700 hover:bg-green-50 rounded disabled:opacity-50">
                                                            {saving === editId ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                                        </button>
                                                        <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => toggleTierActive(t)} title={t.is_active ? 'Deactivate tier' : 'Activate tier'}
                                                        className={`p-1.5 rounded transition-colors ${t.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                                                        {t.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </Section>
            ))}
        </div>
    )
}


// ════════════════════════════════════════════════════════════════
//  PERIOD DISCOUNTS TAB
// ════════════════════════════════════════════════════════════════
function DiscountsTab({ supabase }) {
    const [discounts, setDiscounts] = useState([])
    const [loading, setLoading] = useState(true)
    const [editId, setEditId] = useState(null)
    const [editPct, setEditPct] = useState('')
    const [saving, setSaving] = useState(null)
    const [toast, setToast] = useState({ message: '', type: 'success' })

    useEffect(() => { load() }, [])

    const load = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('subscription_period_discounts')
            .select('*, period:billing_periods(code, display_name, duration_months, sort_order)')
            .order('billing_period_id')
        // Sort by period sort_order
        const sorted = (data || []).sort((a, b) => (a.period?.sort_order || 0) - (b.period?.sort_order || 0))
        setDiscounts(sorted)
        setLoading(false)
    }

    const saveDiscount = async (id) => {
        setSaving(id)
        try {
            const { error } = await supabase.from('subscription_period_discounts')
                .update({ discount_percentage: Number(editPct) }).eq('id', id)
            if (error) throw error
            setEditId(null)
            setToast({ message: 'Discount updated', type: 'success' })
            setTimeout(() => setToast({ message: '' }), 2500)
            await load()
        } catch (e) {
            setToast({ message: e.message, type: 'error' })
        } finally {
            setSaving(null)
        }
    }

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

    return (
        <Section title="Billing period discounts" description="Discount percentage applied to the base monthly price for longer commitments. Higher discount = more incentive to subscribe long-term.">
            <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {discounts.map(d => {
                    const isEditing = editId === d.id
                    return (
                        <div key={d.id} className={`rounded-xl border p-4 text-center transition-all ${isEditing ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300 cursor-pointer'}`}
                            onClick={() => { if (!isEditing) { setEditId(d.id); setEditPct(d.discount_percentage) } }}>
                            <p className="text-xs text-gray-500 font-medium mb-1">{d.period?.display_name}</p>
                            <p className="text-xs text-gray-400 mb-2">{d.period?.duration_months} months</p>
                            {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                    <input type="number" value={editPct} onChange={e => setEditPct(e.target.value)}
                                        min="0" max="100" step="0.5"
                                        className="w-16 px-2 py-1.5 border border-blue-300 rounded text-center text-lg font-bold focus:ring-2 focus:ring-blue-500" autoFocus />
                                    <span className="text-lg font-bold text-gray-400">%</span>
                                </div>
                            ) : (
                                <p className="text-3xl font-bold text-gray-900">{d.discount_percentage}%</p>
                            )}
                            {isEditing && (
                                <div className="flex justify-center gap-2 mt-3">
                                    <button onClick={(e) => { e.stopPropagation(); saveDiscount(d.id) }} disabled={saving === d.id}
                                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50">
                                        {saving === d.id ? 'Saving…' : 'Save'}
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); setEditId(null) }}
                                        className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded-md hover:bg-gray-300">Cancel</button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </Section>
    )
}


// ════════════════════════════════════════════════════════════════
//  TRIAL CONFIG TAB
// ════════════════════════════════════════════════════════════════
function TrialConfigTab({ supabase }) {
    const [configs, setConfigs] = useState([])
    const [loading, setLoading] = useState(true)
    const [editId, setEditId] = useState(null)
    const [editData, setEditData] = useState({})
    const [saving, setSaving] = useState(null)
    const [toast, setToast] = useState({ message: '', type: 'success' })

    useEffect(() => { load() }, [])

    const load = async () => {
        setLoading(true)
        const { data } = await supabase.from('subscription_trial_overview').select('*')
        setConfigs(data || [])
        setLoading(false)
    }

    const startEdit = (c) => {
        setEditId(c.subscription_type)
        setEditData({
            trial_duration_months: c.trial_duration_months,
            free_vehicle_count: c.free_vehicle_count,
            free_staff_count: c.free_staff_count,
            free_client_count: c.free_client_count,
            description: c.description,
        })
    }

    const saveEdit = async () => {
        setSaving(editId)
        try {
            const typeRow = configs.find(c => c.subscription_type === editId)
            // Need to get the actual ID from the trial config table
            const { data: tcData } = await supabase.from('subscription_trial_config')
                .select('id').eq('subscription_type_id', (await supabase.from('subscription_types').select('id').eq('code', editId).single()).data.id).single()

            const update = { ...editData }
            for (const k of ['trial_duration_months', 'free_vehicle_count', 'free_staff_count', 'free_client_count']) {
                update[k] = Number(update[k]) || 0
            }

            const { error } = await supabase.from('subscription_trial_config').update(update).eq('id', tcData.id)
            if (error) throw error
            setEditId(null)
            setToast({ message: 'Trial config updated', type: 'success' })
            setTimeout(() => setToast({ message: '' }), 2500)
            await load()
        } catch (e) {
            setToast({ message: e.message, type: 'error' })
        } finally {
            setSaving(null)
        }
    }

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

    const icons = { individual: Users, company: Building2, service_provider: Wrench }

    return (
        <div className="space-y-4">
            <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {configs.map(c => {
                    const Icon = icons[c.subscription_type] || Users
                    const isEditing = editId === c.subscription_type
                    return (
                        <div key={c.subscription_type}
                            className={`bg-white rounded-xl border p-5 ${isEditing ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200'}`}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-50 rounded-lg"><Icon size={18} className="text-blue-600" /></div>
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900">{c.type_name}</h3>
                                    <p className="text-xs text-gray-400">{c.subscription_type}</p>
                                </div>
                            </div>

                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Trial duration</span>
                                    {isEditing ? (
                                        <div className="flex items-center gap-1">
                                            <input type="number" value={editData.trial_duration_months} min={0}
                                                onChange={e => setEditData(d => ({ ...d, trial_duration_months: e.target.value }))}
                                                className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm" />
                                            <span className="text-xs text-gray-400">months</span>
                                        </div>
                                    ) : (
                                        <span className="font-medium text-gray-900">{c.trial_duration_months ? `${c.trial_duration_months} months` : 'None'}</span>
                                    )}
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Free vehicles</span>
                                    {isEditing ? (
                                        <input type="number" value={editData.free_vehicle_count} min={0}
                                            onChange={e => setEditData(d => ({ ...d, free_vehicle_count: e.target.value }))}
                                            className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm" />
                                    ) : (
                                        <span className="font-medium text-gray-900">{c.free_vehicle_count}</span>
                                    )}
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Free staff</span>
                                    {isEditing ? (
                                        <input type="number" value={editData.free_staff_count} min={0}
                                            onChange={e => setEditData(d => ({ ...d, free_staff_count: e.target.value }))}
                                            className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm" />
                                    ) : (
                                        <span className="font-medium text-gray-900">{c.free_staff_count}</span>
                                    )}
                                </div>
                            </div>

                            {isEditing ? (
                                <div className="mt-3">
                                    <textarea value={editData.description || ''} rows={2}
                                        onChange={e => setEditData(d => ({ ...d, description: e.target.value }))}
                                        className={inp + ' text-xs'} placeholder="Description…" />
                                    <div className="flex gap-2 mt-3">
                                        <button onClick={saveEdit} disabled={saving}
                                            className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                            {saving ? 'Saving…' : 'Save changes'}
                                        </button>
                                        <button onClick={() => setEditId(null)}
                                            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="text-xs text-gray-400 mt-3 border-t border-gray-100 pt-3">{c.description}</p>
                                    <button onClick={() => startEdit(c)}
                                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">Edit config</button>
                                </>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════
// Add ShopTiersTab component 
// ═══════════════════════════════════════════════════════════

function ShopTiersTab({ supabase }) {
    const [tiers, setTiers] = useState([])
    const [loading, setLoading] = useState(true)
    const [editId, setEditId] = useState(null)
    const [editData, setEditData] = useState({})
    const [saving, setSaving] = useState(null)
    const [toast, setToast] = useState({ message: '', type: 'success' })

    useEffect(() => { load() }, [])

    const load = async () => {
        setLoading(true)
        const { data } = await supabase
            .from('subscription_shop_tiers')
            .select('*, currency:currencies(code, symbol)')
            .order('sort_order')
        setTiers(data || [])
        setLoading(false)
    }

    const startEdit = (t) => {
        setEditId(t.id)
        setEditData({
            tier_name: t.tier_name,
            min_shops: t.min_shops,
            max_shops: t.max_shops,
            per_shop_monthly_price: t.per_shop_monthly_price,
            flat_monthly_price: t.flat_monthly_price || 0,
            is_active: t.is_active,
        })
    }

    const saveEdit = async () => {
        setSaving(editId)
        try {
            const update = { ...editData }
            for (const k of ['min_shops', 'max_shops', 'per_shop_monthly_price', 'flat_monthly_price']) {
                update[k] = update[k] === '' || update[k] === null ? null : Number(update[k])
            }
            const { error } = await supabase.from('subscription_shop_tiers').update(update).eq('id', editId)
            if (error) throw error
            setEditId(null)
            setToast({ message: 'Shop tier updated', type: 'success' })
            setTimeout(() => setToast({ message: '' }), 2500)
            await load()
        } catch (e) {
            setToast({ message: e.message, type: 'error' })
        } finally {
            setSaving(null)
        }
    }

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div>

    return (
        <Section
            title="Shop pricing tiers"
            description="Add-on pricing for service providers with multiple shops. 1st shop is included in base pricing. Rates are modest since staff + client pricing covers the core cost.">
            <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-200">
                            <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Tier</th>
                            <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Shops range</th>
                            <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Per shop/mo</th>
                            <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Flat rate/mo</th>
                            <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500 uppercase">Active</th>
                            <th className="text-right py-2.5 px-3 w-20" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {tiers.map(t => {
                            const isEditing = editId === t.id
                            return (
                                <tr key={t.id}
                                    className={`hover:bg-gray-50 cursor-pointer ${isEditing ? 'bg-blue-50' : ''} ${!t.is_active ? 'opacity-50' : ''}`}
                                    onClick={() => !isEditing && startEdit(t)}>
                                    <td className="py-2.5 px-3">
                                        {isEditing ? (
                                            <input type="text" value={editData.tier_name} onChange={e => setEditData(d => ({ ...d, tier_name: e.target.value }))}
                                                className={inp + ' py-1 text-xs'} />
                                        ) : (
                                            <div>
                                                <p className="font-medium text-gray-900">{t.tier_name}</p>
                                                <p className="text-[10px] text-gray-400">{t.tier_code}</p>
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center text-gray-600">
                                        {isEditing ? (
                                            <div className="flex gap-1 items-center justify-center">
                                                <input type="number" value={editData.min_shops ?? ''} onChange={e => setEditData(d => ({ ...d, min_shops: e.target.value }))}
                                                    className={inp + ' py-1 w-14 text-xs text-center'} />
                                                <span>–</span>
                                                <input type="number" value={editData.max_shops ?? ''} onChange={e => setEditData(d => ({ ...d, max_shops: e.target.value }))}
                                                    className={inp + ' py-1 w-14 text-xs text-center'} placeholder="∞" />
                                            </div>
                                        ) : (
                                            t.max_shops ? `${t.min_shops}–${t.max_shops}` : `${t.min_shops}+`
                                        )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono">
                                        {isEditing ? (
                                            <input type="number" step="0.01" value={editData.per_shop_monthly_price}
                                                onChange={e => setEditData(d => ({ ...d, per_shop_monthly_price: e.target.value }))}
                                                className={inp + ' py-1 w-20 text-xs text-right'} />
                                        ) : (
                                            `${t.currency?.symbol || '$'}${Number(t.per_shop_monthly_price).toFixed(2)}`
                                        )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono">
                                        {isEditing ? (
                                            <input type="number" step="0.01" value={editData.flat_monthly_price}
                                                onChange={e => setEditData(d => ({ ...d, flat_monthly_price: e.target.value }))}
                                                className={inp + ' py-1 w-20 text-xs text-right'}
                                                disabled={!t.is_upper_limit} />
                                        ) : (
                                            t.is_upper_limit ? `${t.currency?.symbol || '$'}${Number(t.flat_monthly_price || 0).toFixed(2)}` : '—'
                                        )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                        {t.is_upper_limit
                                            ? <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">FLAT</span>
                                            : t.min_shops <= 1
                                                ? <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">FREE</span>
                                                : <span className="text-[10px] text-gray-500">Per shop</span>}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                        {t.is_active
                                            ? <ToggleRight size={20} className="text-green-600 mx-auto" />
                                            : <ToggleLeft size={20} className="text-gray-400 mx-auto" />}
                                    </td>
                                    <td className="py-2.5 px-3 text-right" onClick={e => e.stopPropagation()}>
                                        {isEditing && (
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={saveEdit} disabled={saving === editId}
                                                    className="p-1.5 text-green-700 hover:bg-green-50 rounded disabled:opacity-50">
                                                    {saving === editId ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                                </button>
                                                <button onClick={() => setEditId(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </Section>
    )
}


// ════════════════════════════════════════════════════════════════
//  PRICE CALCULATOR TAB
// ════════════════════════════════════════════════════════════════
function CalculatorTab({ supabase }) {
    const [type, setType] = useState('individual')
    const [vehicles, setVehicles] = useState(1)
    const [staff, setStaff] = useState(1)
    const [clients, setClients] = useState(5)
    const [shops, setShops] = useState(1)
    const [period, setPeriod] = useState('monthly')
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showSaveModal, setShowSaveModal] = useState(false)
    const [savedPlan, setSavedPlan] = useState(null)
    // Tier selector for individual
    const [indTiers, setIndTiers] = useState([])
    const [selectedTier, setSelectedTier] = useState('auto')
    const [discounts, setDiscounts] = useState({})

    // Load individual tiers and discounts on mount
    useEffect(() => {
        const load = async () => {
            const [{ data: tiers }, { data: discs }] = await Promise.all([
                supabase.from('subscription_pricing_overview').select('*').eq('subscription_type', 'individual').eq('is_active', true).order('sort_order'),
                supabase.from('subscription_period_discounts').select('*, billing_periods!inner(code, duration_months)').eq('is_active', true),
            ])
            setIndTiers(tiers || [])
            const discMap = {}
            ;(discs || []).forEach(d => { discMap[d.billing_periods.code] = { pct: Number(d.discount_percentage), months: d.billing_periods.duration_months } })
            setDiscounts(discMap)
        }
        load()
    }, [])

    const compute = async () => {
        setLoading(true)
        setError('')
        setResult(null)
        try {
            // If individual + specific tier selected → compute locally
            if (type === 'individual' && selectedTier !== 'auto') {
                const tier = indTiers.find(t => t.tier_code === selectedTier)
                if (!tier) throw new Error('Tier not found')
                const base = Number(tier.base_monthly_price)
                const isFree = base === 0
                const disc = discounts[period] || { pct: 0, months: 1 }
                const discounted = isFree ? 0 : Math.round(base * (1 - disc.pct / 100) * 100) / 100
                const total = isFree ? 0 : Math.round(discounted * disc.months * 100) / 100
                const savings = isFree ? 0 : Math.round((base * disc.months - total) * 100) / 100
                const features = (() => { try { return typeof tier.features === 'string' ? JSON.parse(tier.features) : (tier.features || []) } catch { return [] } })()
                setResult({
                    success: true,
                    subscriber_type: 'individual',
                    metrics: { vehicles, staff: 0, monthly_clients: 0, shops: 0 },
                    tier: { code: tier.tier_code, name: tier.tier_name, features },
                    pricing: {
                        base_monthly_price: base, shop_addon_monthly: 0,
                        monthly_total: base, billing_period: period,
                        duration_months: disc.months, discount_percentage: disc.pct,
                        discounted_monthly: discounted, period_total: total,
                        savings, currency_code: tier.currency_code, currency_symbol: tier.currency_symbol,
                    },
                    trial: { is_free: isFree, reason: isFree ? 'Free tier' : null },
                })
            } else {
                // Use RPC for auto-match or other types
                // null subscriber_id → skips trial eligibility check (simulator mode)
                // Only pass metrics relevant to each subscriber type
                const params = {
                    p_subscriber_type: type,
                    p_subscriber_id: null,
                    p_billing_period_code: period,
                    p_vehicle_count: (type === 'individual' || type === 'company') ? vehicles : 0,
                    p_staff_count: (type === 'company' || type === 'service_provider') ? staff : 0,
                    p_monthly_client_count: type === 'service_provider' ? clients : 0,
                    p_shop_count: type === 'service_provider' ? shops : 0,
                }
                const { data, error: rpcErr } = await supabase.rpc('compute_subscription_price', params)
                if (rpcErr) throw rpcErr
                const r = typeof data === 'string' ? JSON.parse(data) : data
                if (!r.success) throw new Error(r.error)
                setResult(r)
            }
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Inputs" description="Simulate pricing for any subscriber configuration">
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Subscriber type</label>
                        <select value={type} onChange={e => setType(e.target.value)} className={inp}>
                            <option value="individual">Individual</option>
                            <option value="company">Company</option>
                            <option value="service_provider">Service Provider</option>
                        </select>
                    </div>

                    {(type === 'individual' || type === 'company') && (
                        <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">
                                Number of vehicles
                            </label>
                            <input type="number" min={0} value={vehicles} onChange={e => setVehicles(Number(e.target.value))}
                                className={inp} />
                        </div>
                    )}

                    {type === 'individual' && indTiers.length > 0 && (
                        <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">Tier (override)</label>
                            <select value={selectedTier} onChange={e => setSelectedTier(e.target.value)} className={inp}>
                                <option value="auto">Auto-match by vehicle count</option>
                                {indTiers.map(t => (
                                    <option key={t.tier_code} value={t.tier_code}>
                                        {t.tier_name} — ${Number(t.base_monthly_price).toFixed(2)}/mo
                                        {Number(t.base_monthly_price) === 0 ? ' (Free)' : ''}
                                        {t.min_vehicles != null ? ` · ${t.min_vehicles}${t.max_vehicles ? '–' + t.max_vehicles : '+'} vehicles` : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1">Select a specific tier or let the system match by vehicle count</p>
                        </div>
                    )}

                    {(type === 'company' || type === 'service_provider') && (
                        <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">Number of staff</label>
                            <input type="number" min={0} value={staff} onChange={e => setStaff(Number(e.target.value))}
                                className={inp} />
                        </div>
                    )}

                    {type === 'service_provider' && (
                        <>
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Monthly clients</label>
                                <input type="number" min={0} value={clients} onChange={e => setClients(Number(e.target.value))}
                                    className={inp} />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Number of shops</label>
                                <input type="number" min={1} value={shops} onChange={e => setShops(Number(e.target.value))}
                                    className={inp} />
                                <p className="text-[10px] text-gray-400 mt-1">1st shop included free</p>
                            </div>
                        </>
                    )}
                    
                    <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">Billing period</label>
                        <select value={period} onChange={e => setPeriod(e.target.value)} className={inp}>
                            <option value="monthly">Monthly (0% off)</option>
                            <option value="quarterly">Quarterly (5% off)</option>
                            <option value="semi_annual">Semi-annual (10% off)</option>
                            <option value="annual">Annual (15% off)</option>
                            <option value="tri_annual">Tri-annual (25% off)</option>
                        </select>
                    </div>

                    <button onClick={compute} disabled={loading}
                        className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                        Compute price
                    </button>

                    {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}
                </div>
            </Section>

            <Section title="Result" description={result ? `Tier: ${result.tier?.name}` : 'Run a simulation to see results'}>
                {result ? (
                    <div className="space-y-4">
                        {result.trial?.is_free && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                    <Gift size={16} className="text-green-600" />
                                    <p className="text-sm font-medium text-green-800">Free tier / trial active</p>
                                </div>
                                <p className="text-xs text-green-600 mt-1">{result.trial.reason}</p>
                            </div>
                        )}

                        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Tier</span>
                                <span className="font-semibold text-gray-900">{result.tier?.name}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Base monthly</span>
                                <span className="font-mono text-gray-700">{result.pricing?.currency_symbol || '$'}{Number(result.pricing?.base_monthly_price).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Discount</span>
                                <span className="text-green-600 font-medium">{result.pricing?.discount_percentage}%</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Discounted monthly</span>
                                <span className="font-mono text-gray-700">{result.pricing?.currency_symbol || '$'}{Number(result.pricing?.discounted_monthly).toFixed(2)}</span>
                            </div>
                            <div className="border-t border-gray-200 pt-3 flex justify-between text-sm">
                                <span className="text-gray-900 font-medium">Period total ({result.pricing?.duration_months} months)</span>
                                <span className="font-bold text-xl text-gray-900">{result.pricing?.currency_symbol || '$'}{Number(result.pricing?.period_total).toFixed(2)}</span>
                            </div>
                            {result.pricing?.savings > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-green-600">You save</span>
                                    <span className="font-medium text-green-600">{result.pricing?.currency_symbol || '$'}{Number(result.pricing?.savings).toFixed(2)}</span>
                                </div>
                            )}
                            {result.pricing?.shop_addon_monthly > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Shop add-on</span>
                                    <span className="font-mono text-gray-700">+{result.pricing?.currency_symbol || '$'}{Number(result.pricing?.shop_addon_monthly).toFixed(2)}/mo</span>
                                </div>
                            )}
                        </div>

                        {/* Custom pricing breakdown */}
                        {result.custom_pricing && (() => {
                            const hasExtras = Number(result.custom_pricing.total_extras) > 0
                            return (
                            <div className={`border rounded-lg p-4 space-y-3 ${hasExtras ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <AlertCircle size={14} className={hasExtras ? 'text-amber-600' : 'text-blue-600'} />
                                    <p className={`text-xs font-semibold ${hasExtras ? 'text-amber-800' : 'text-blue-800'}`}>
                                        {hasExtras ? 'Custom Pricing (no exact tier match)' : 'Tier matched via fallback'}
                                    </p>
                                </div>
                                <p className={`text-[10px] ${hasExtras ? 'text-amber-600' : 'text-blue-600'}`}>
                                    {hasExtras
                                        ? <>Parameters exceed <strong>{result.custom_pricing.base_tier}</strong> tier ranges. Per-extra surcharges applied.</>
                                        : <>No exact tier boundary match. <strong>{result.custom_pricing.base_tier}</strong> selected as best fit — no surcharges needed.</>
                                    }
                                </p>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className={hasExtras ? 'text-amber-700' : 'text-blue-700'}>Base tier price</span>
                                        <span className={`font-mono ${hasExtras ? 'text-amber-900' : 'text-blue-900'}`}>{result.pricing?.currency_symbol || '$'}{Number(result.custom_pricing.base_tier_price).toFixed(2)}/mo</span>
                                    </div>
                                    {result.custom_pricing.extra_vehicles > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-amber-700">+ {result.custom_pricing.extra_vehicles} extra vehicle(s) × {result.pricing?.currency_symbol || '$'}{Number(result.custom_pricing.extra_vehicle_rate).toFixed(2)}</span>
                                            <span className="font-mono text-amber-900">+{result.pricing?.currency_symbol || '$'}{Number(result.custom_pricing.extra_vehicle_cost).toFixed(2)}/mo</span>
                                        </div>
                                    )}
                                    {result.custom_pricing.extra_staff > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-amber-700">+ {result.custom_pricing.extra_staff} extra staff × {result.pricing?.currency_symbol || '$'}{Number(result.custom_pricing.extra_staff_rate).toFixed(2)}</span>
                                            <span className="font-mono text-amber-900">+{result.pricing?.currency_symbol || '$'}{Number(result.custom_pricing.extra_staff_cost).toFixed(2)}/mo</span>
                                        </div>
                                    )}
                                    {result.custom_pricing.extra_clients > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-amber-700">+ {result.custom_pricing.extra_clients} extra client(s) × {result.pricing?.currency_symbol || '$'}{Number(result.custom_pricing.extra_client_rate).toFixed(2)}</span>
                                            <span className="font-mono text-amber-900">+{result.pricing?.currency_symbol || '$'}{Number(result.custom_pricing.extra_client_cost).toFixed(2)}/mo</span>
                                        </div>
                                    )}
                                    {hasExtras && (
                                        <div className="flex justify-between text-xs border-t border-amber-300 pt-1 mt-1">
                                            <span className="font-semibold text-amber-900">Total extras</span>
                                            <span className="font-mono font-semibold text-amber-900">+{result.pricing?.currency_symbol || '$'}{Number(result.custom_pricing.total_extras).toFixed(2)}/mo</span>
                                        </div>
                                    )}
                                </div>

                                {/* All tiers comparison */}
                                {result.custom_pricing.all_evaluations && (
                                    <div className="mt-3">
                                        <p className="text-[10px] font-semibold text-amber-800 mb-1 uppercase">All tiers evaluated</p>
                                        <table className="w-full text-[10px] border-collapse">
                                            <thead>
                                                <tr className="bg-amber-100/50">
                                                    <th className="text-left p-1 font-semibold text-amber-700">Tier</th>
                                                    <th className="text-right p-1 font-semibold text-amber-700">Base</th>
                                                    <th className="text-right p-1 font-semibold text-amber-700">Extras</th>
                                                    <th className="text-right p-1 font-semibold text-amber-700">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.custom_pricing.all_evaluations.map((e, i) => {
                                                    const skipped = e.can_price_extras === false
                                                    return (
                                                    <tr key={i} className={e.is_winner ? 'bg-green-50 font-semibold' : skipped ? 'opacity-40' : ''}>
                                                        <td className="p-1 text-amber-900">
                                                            {skipped ? <span className="line-through">{e.tier}</span> : e.tier}
                                                            {e.is_winner && <span className="text-green-600 ml-1">✓</span>}
                                                            {skipped && <span className="text-red-400 ml-1 no-underline" title="Per-extra rate is $0 for a needed dimension">⊘</span>}
                                                        </td>
                                                        <td className="p-1 text-right text-amber-700 font-mono">{Number(e.base).toFixed(2)}</td>
                                                        <td className="p-1 text-right text-amber-700 font-mono">
                                                            {skipped ? (
                                                                <span className="text-red-400 italic">n/a</span>
                                                            ) : (
                                                                <>
                                                                    {Number(e.extra_cost) > 0 ? `+${Number(e.extra_cost).toFixed(2)}` : '—'}
                                                                    {(e.extra_staff > 0 || e.extra_clients > 0 || e.extra_vehicles > 0) && (
                                                                        <span className="text-amber-500 ml-1">
                                                                            ({[
                                                                                e.extra_staff > 0 ? `${e.extra_staff}s` : '',
                                                                                e.extra_clients > 0 ? `${e.extra_clients}c` : '',
                                                                                e.extra_vehicles > 0 ? `${e.extra_vehicles}v` : '',
                                                                            ].filter(Boolean).join('+')})
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}
                                                        </td>
                                                        <td className={`p-1 text-right font-mono ${e.is_winner ? 'text-green-700' : skipped ? 'text-red-400' : 'text-amber-900'}`}>
                                                            {skipped ? '—' : Number(e.total).toFixed(2)}
                                                        </td>
                                                    </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            )
                        })()}

                        <div>
                            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Metrics used</p>
                            <div className="flex flex-wrap gap-3 text-xs">
                                {(type === 'individual' || type === 'company') && (
                                    <span className="bg-gray-100 px-2 py-1 rounded">{result.metrics?.vehicles} vehicle{result.metrics?.vehicles !== 1 ? 's' : ''}</span>
                                )}
                                {(type === 'company' || type === 'service_provider') && (
                                    <span className="bg-gray-100 px-2 py-1 rounded">{result.metrics?.staff} staff</span>
                                )}
                                {type === 'service_provider' && (
                                    <span className="bg-gray-100 px-2 py-1 rounded">{result.metrics?.monthly_clients} clients/mo</span>
                                )}
                                {type === 'service_provider' && (
                                    <span className="bg-gray-100 px-2 py-1 rounded">{result.metrics?.shops} shop{result.metrics?.shops !== 1 ? 's' : ''}</span>
                                )}
                            </div>
                        </div>

                        {result.tier?.features && result.tier.features.length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Included features</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {result.tier.features.map((f, i) => (
                                        <span key={i} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                                            <CheckCircle size={10} /> {f}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {result.shop_breakdown && (
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Shop add-on</p>
                                <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Total shops</span>
                                        <span className="font-medium">{result.shop_breakdown.total_shops}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Free shops</span>
                                        <span className="text-green-600">{result.shop_breakdown.free_shops}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Billable shops</span>
                                        <span className="font-medium">{result.shop_breakdown.billable_shops}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Tier</span>
                                        <span>{result.shop_breakdown.tier_name}</span>
                                    </div>
                                    {result.shop_breakdown.is_flat_rate ? (
                                        <div className="flex justify-between border-t border-gray-200 pt-1.5">
                                            <span className="text-gray-700 font-medium">Flat rate/mo</span>
                                            <span className="font-mono font-medium">${Number(result.shop_breakdown.monthly_addon).toFixed(2)}</span>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between border-t border-gray-200 pt-1.5">
                                            <span className="text-gray-700 font-medium">Shop add-on/mo</span>
                                            <span className="font-mono font-medium">
                                                {result.shop_breakdown.billable_shops} × ${Number(result.shop_breakdown.per_shop_price).toFixed(2)} = ${Number(result.shop_breakdown.monthly_addon).toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Save as Custom Plan — only for company / service_provider,
                            and only when pricing is genuinely custom (has extras).
                            If the fallback matched a standard tier with 0 extras,
                            the standard packages already cover it — no custom plan needed. */}
                        {type !== 'individual' && !(result.custom_pricing && Number(result.custom_pricing.total_extras) === 0) && (
                            <div className="pt-2 border-t border-gray-100 mt-2">
                                <button
                                    onClick={() => setShowSaveModal(true)}
                                    className="w-full py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Sparkles size={16} /> Save as Custom Plan
                                </button>
                                {savedPlan && (
                                    <p className="text-[10px] text-green-600 text-center mt-1.5 flex items-center justify-center gap-1">
                                        <CheckCircle size={10} /> Last saved: {savedPlan.package_name_prefix}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                        <Calculator size={40} />
                        <p className="text-sm mt-2">Set inputs and click compute</p>
                    </div>
                )}
            </Section>

            {/* Save Custom Plan Modal */}
            <SaveCustomPlanModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                onSaved={(res) => setSavedPlan(res)}
                supabase={supabase}
                subscriberType={type}
                calculatorResult={result}
            />
        </div>
    )
}

// ════════════════════════════════════════════════════════════════
//  ADMIN INVOICES TAB
// ════════════════════════════════════════════════════════════════
 
const PAYMENT_METHODS_ADMIN = [
  { value: 'mpesa',         label: 'M-Pesa',   icon: CreditCard },
  { value: 'cash',          label: 'Cash',      icon: Banknote },
  { value: 'card',          label: 'Card',      icon: CreditCard },
  { value: 'bank_transfer', label: 'Bank',      icon: Building2 },
]
 
function InvoicesTab({ supabase }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [expandedId, setExpandedId] = useState(null)
  const pageSize = 15

  // Payment form
  const [payingId, setPayingId] = useState(null)
  const [payMethod, setPayMethod] = useState('mpesa')
  const [payAmount, setPayAmount] = useState('')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paying, setPaying] = useState(false)
  const [downloadingId, setDownloadingId] = useState(null)

  useEffect(() => { loadInvoices() }, [statusFilter, page])

  const loadInvoices = async () => {
    setLoading(true)
    try {
      let q = supabase.from('subscription_invoice_details')
        .select('*', { count: 'exact' })
        .gt('total_amount', 0)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (statusFilter !== 'all') q = q.eq('effective_status', statusFilter)
      const { data, count, error } = await q
      if (error) throw error
      setInvoices(data || [])
      setTotal(count || 0)
    } catch (e) { console.error('Invoice load error:', e) }
    finally { setLoading(false) }
  }

  const handlePayment = async (invoiceId) => {
    if (!payAmount || parseFloat(payAmount) <= 0) { setToast({ message: 'Enter a valid amount', type: 'error' }); return }
    setPaying(true)
    try {
      const { data, error } = await supabase.rpc('record_subscription_payment', {
        p_invoice_id: invoiceId, p_amount: parseFloat(payAmount),
        p_paid_via: payMethod, p_transaction_id: payRef || null, p_notes: payNotes || null,
      })
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (!result.success) throw new Error(result.error)
      setToast({ message: `Payment recorded — Ref: ${result.payment_ref}`, type: 'success' })
      setTimeout(() => setToast({ message: '' }), 4000)
      setPayingId(null); setPayAmount(''); setPayRef(''); setPayNotes('')
      await loadInvoices()
    } catch (e) { setToast({ message: e.message, type: 'error' }) }
    finally { setPaying(false) }
  }

  const buildInvArgs = (inv) => {
    const subPath = inv.user_id ? '/dashboard/subscription'
      : inv.company_id ? '/company/subscription'
      : inv.service_provider_id ? '/provider/subscription'
      : '/dashboard/subscription'
    return {
      invoiceRef: inv.invoice_ref_no, subscriptionNumber: inv.subscription_number,
      packageName: inv.package_name || 'Subscription',
      subscriberName: inv.subscriber_name || null,
      subscriberEmail: inv.subscriber_email || null,
      subscriberPhone: inv.subscriber_phone || null,
      billingStart: inv.billing_period_start, billingEnd: inv.billing_period_end,
      issuedAt: inv.created_at, dueDate: inv.due_date,
      amountDue: inv.amount_due || inv.total_amount, taxAmount: inv.tax_amount || 0,
      totalAmount: inv.total_amount, grossAmount: inv.gross_amount || inv.total_amount,
      upgradeCredit: Number(inv.upgrade_credit || 0), upgradeNotes: inv.upgrade_notes || null,
      currencySymbol: inv.currency_symbol || '', status: inv.effective_status || 'unpaid',
      ctaUrl: typeof window !== 'undefined' ? `${window.location.origin}${subPath}?view=invoices&invoice=${inv.id}` : '#',
    }
  }

  const viewInvoice = (inv) => {
    const w = window.open('', '_blank')
    w.document.write(buildSubscriptionInvoiceHtml({ ...buildInvArgs(inv), forPdf: false }))
    w.document.close()
  }

  const downloadInvoice = async (inv) => {
    setDownloadingId(inv.id)
    try { await downloadHtmlAsPdf(buildSubscriptionInvoiceHtml({ ...buildInvArgs(inv), forPdf: true }), `Invoice-${inv.invoice_ref_no}`) }
    catch (e) { console.error('PDF error:', e) }
    finally { setDownloadingId(null) }
  }

  const filtered = invoices.filter(i => {
    if (!search) return true
    const q = search.toLowerCase()
    return (i.invoice_ref_no || '').toLowerCase().includes(q) || (i.subscription_number || '').toLowerCase().includes(q)
  })
  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const fmtA = (n, sym) => `${sym || ''}${Number(n || 0).toLocaleString()}`

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)} className={inp + ' pl-9'} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} className={inp + ' w-auto'}>
          <option value="all">All statuses</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="overdue">Overdue</option>
        </select>
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div> : (
        <>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <FileText size={36} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No invoices found</p>
              </div>
            ) : filtered.map(inv => {
              const isExpanded = expandedId === inv.id
              const isPaid = inv.effective_status === 'paid'
              const hasCredit = Number(inv.upgrade_credit || 0) > 0
              return (
                <div key={inv.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <button onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                    className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isPaid ? 'bg-green-100' : 'bg-amber-100'}`}>
                        <FileText size={14} className={isPaid ? 'text-green-600' : 'text-amber-600'} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{inv.invoice_ref_no}</p>
                        <p className="text-[10px] text-gray-400">{inv.subscriber_name && `${inv.subscriber_name} · `}{inv.subscription_number} · {inv.package_name} · Due {fmtD(inv.due_date)}</p>
                        {hasCredit && <p className="text-[10px] text-green-600 font-medium">↗ Upgrade credit: {fmtA(inv.upgrade_credit, inv.currency_symbol)}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{fmtA(inv.total_amount, inv.currency_symbol)}</p>
                        {!isPaid && Number(inv.balance_due) > 0 && <p className="text-[10px] text-red-500">Balance: {fmtA(inv.balance_due, inv.currency_symbol)}</p>}
                      </div>
                      <StatusBadge code={inv.effective_status} />
                      {isExpanded ? <ChevronDown size={14} className="text-gray-400 rotate-180" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {hasCredit && <div><p className="text-xs text-gray-500">Package Price</p><p className="font-semibold">{fmtA(inv.gross_amount, inv.currency_symbol)}</p></div>}
                        {hasCredit && <div><p className="text-xs text-green-600">Upgrade Credit</p><p className="font-semibold text-green-600">−{fmtA(inv.upgrade_credit, inv.currency_symbol)}</p></div>}
                        <div><p className="text-xs text-gray-500">Amount Due</p><p className="font-semibold">{fmtA(inv.amount_due, inv.currency_symbol)}</p></div>
                        <div><p className="text-xs text-gray-500">Tax</p><p className="font-semibold">{fmtA(inv.tax_amount, inv.currency_symbol)}</p></div>
                        <div><p className="text-xs text-gray-500">Total Paid</p><p className="font-semibold text-green-700">{fmtA(inv.total_paid, inv.currency_symbol)}</p></div>
                        <div><p className="text-xs text-gray-500">Period</p><p className="font-semibold">{fmtD(inv.billing_period_start)} – {fmtD(inv.billing_period_end)}</p></div>
                      </div>

                      {hasCredit && inv.upgrade_notes && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-xs text-green-700">{inv.upgrade_notes}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button onClick={() => viewInvoice(inv)}
                          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                          <FileText size={14} /> View
                        </button>
                        <button onClick={() => downloadInvoice(inv)} disabled={downloadingId === inv.id}
                          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                          {downloadingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={14} />}
                          {downloadingId === inv.id ? 'PDF…' : 'PDF'}
                        </button>
                        {!isPaid && (
                          <button onClick={() => { setPayingId(payingId === inv.id ? null : inv.id); setPayAmount(inv.balance_due?.toString()) }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors">
                            <DollarSign size={14} /> {payingId === inv.id ? 'Cancel' : 'Record Payment'}
                          </button>
                        )}
                      </div>

                      {payingId === inv.id && (
                        <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
                          <div className="grid grid-cols-4 gap-2">
                            {PAYMENT_METHODS_ADMIN.map(m => (
                              <button key={m.value} onClick={() => setPayMethod(m.value)}
                                className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] font-semibold transition-all ${payMethod === m.value ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                                <m.icon size={14} /> {m.label}
                              </button>
                            ))}
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Amount</label><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} className={inp} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Transaction Ref</label><input type="text" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="e.g. M-Pesa QXZ" className={inp} /></div>
                            <div><label className="text-[10px] font-semibold text-gray-500 block mb-1">Notes</label><input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} className={inp} /></div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handlePayment(inv.id)} disabled={paying}
                              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 disabled:opacity-50">
                              {paying ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={12} />} Confirm Payment
                            </button>
                            <button onClick={() => setPayingId(null)} className="px-3 py-2 text-gray-500 text-xs">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Pagination page={page} pageSize={pageSize} totalCount={total} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════
//  ADMIN RECEIPTS TAB (with confirmation workflow)
// ════════════════════════════════════════════════════════════════

function ReceiptsTab({ supabase, deepLinkedReceipt }) {
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmFilter, setConfirmFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [confirming, setConfirming] = useState(null)
  const [expandedId, setExpandedId] = useState(deepLinkedReceipt)
  const [downloadingId, setDownloadingId] = useState(null)
  const deepScrolled = useRef(false)
  const pageSize = 15

  // Auto-scroll to deep-linked receipt
  useEffect(() => {
    if (deepLinkedReceipt && !loading && !deepScrolled.current) {
      deepScrolled.current = true
      setTimeout(() => {
        const el = document.getElementById(`receipt-${deepLinkedReceipt}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.style.transition = 'box-shadow 0.3s ease'
          el.style.boxShadow = '0 0 0 3px rgba(245,158,11,0.4)'
          setTimeout(() => { el.style.boxShadow = '' }, 2000)
        }
      }, 300)
    }
  }, [deepLinkedReceipt, loading])

  useEffect(() => { loadReceipts() }, [confirmFilter, page])

  const loadReceipts = async () => {
    setLoading(true)
    try {
      let q = supabase.from('subscription_receipt_details')
        .select('*', { count: 'exact' })
        .gt('amount_paid', 0)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (confirmFilter === 'unconfirmed') q = q.eq('confirmed', false)
      if (confirmFilter === 'confirmed') q = q.eq('confirmed', true)
      const { data, count, error } = await q
      if (error) throw error
      setReceipts(data || [])
      setTotal(count || 0)
    } catch (e) { console.error('Receipts load error:', e) }
    finally { setLoading(false) }
  }

  const buildRcptArgs = (r) => ({
    receiptNumber: r.receipt_number, invoiceRef: r.invoice_ref_no || '—',
    subscriptionNumber: r.subscription_number, packageName: r.package_name || 'Subscription',
    subscriberName: r.subscriber_name || r.paid_by_name || null,
    amountPaid: r.amount_paid, amountDue: r.amount_paid, taxAmount: 0, totalInvoice: r.amount_paid,
    paymentMethod: r.payment_method, transactionRef: r.payment_ref_id || r.transaction_ref,
    paidAt: r.issued_at, confirmed: r.confirmed, confirmedAt: r.confirmed_at,
    currencySymbol: r.currency_symbol || '', notes: r.notes,
  })

  const viewReceipt = (r) => {
    const w = window.open('', '_blank')
    w.document.write(buildSubscriptionReceiptHtml(buildRcptArgs(r)))
    w.document.close()
  }

  const downloadReceipt = async (r) => {
    setDownloadingId(r.id)
    try { await downloadHtmlAsPdf(buildSubscriptionReceiptHtml(buildRcptArgs(r)), `Receipt-${r.receipt_number}`) }
    catch (e) { console.error('PDF error:', e) }
    finally { setDownloadingId(null) }
  }

  const handleConfirm = async (receiptId) => {
    if (!confirm('Confirm this payment? This will activate the subscriber\'s plan.')) return
    setConfirming(receiptId)
    try {
      const { data, error } = await supabase.rpc('confirm_subscription_receipt', { p_receipt_id: receiptId })
      if (error) throw error
      const result = typeof data === 'string' ? JSON.parse(data) : data
      if (!result.success) throw new Error(result.error)
      setReceipts(prev => prev.map(r => r.id === receiptId
        ? { ...r, confirmed: true, confirmed_at: result.confirmed_at, confirmed_by_name: 'You' }
        : r
      ))
      const msg = result.subscription_activated
        ? `Receipt ${result.receipt_number} confirmed — subscription activated!`
        : `Receipt ${result.receipt_number} confirmed`
      setToast({ message: msg, type: 'success' })
      setTimeout(() => setToast({ message: '' }), 4000)
      loadReceipts()
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setConfirming(null) }
  }

  const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const fmtDT = (d) => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
  const fmtA = (n, sym) => `${sym || ''}${Number(n || 0).toLocaleString()}`

  const filtered = receipts.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (r.receipt_number || '').toLowerCase().includes(q) || (r.subscription_number || '').toLowerCase().includes(q)
      || (r.paid_by_name || '').toLowerCase().includes(q) || (r.payment_ref_id || '').toLowerCase().includes(q)
  })
  const unconfirmedCount = receipts.filter(r => !r.confirmed).length

  return (
    <div className="space-y-4">
      <Toast message={toast.message} type={toast.type} onDismiss={() => setToast({ message: '' })} />
      {unconfirmedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-800">
          <Clock size={15} /> <strong>{unconfirmedCount}</strong> receipt{unconfirmedCount > 1 ? 's' : ''} awaiting confirmation
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search receipts…" value={search} onChange={e => setSearch(e.target.value)} className={inp + ' pl-9'} />
        </div>
        <select value={confirmFilter} onChange={e => { setConfirmFilter(e.target.value); setPage(1) }} className={inp + ' w-auto'}>
          <option value="all">All receipts</option><option value="unconfirmed">Awaiting confirmation</option><option value="confirmed">Confirmed</option>
        </select>
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" size={24} /></div> : (
        <>
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
                <Receipt size={36} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-400">No receipts found</p>
              </div>
            ) : filtered.map(r => {
              const isExpanded = expandedId === r.id
              return (
                <div key={r.id} id={`receipt-${r.id}`} className={`bg-white rounded-xl border overflow-hidden shadow-sm ${!r.confirmed ? 'border-amber-200' : 'border-gray-200'}`}>
                  <button onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${r.confirmed ? 'bg-green-100' : 'bg-amber-100'}`}>
                        <Receipt size={14} className={r.confirmed ? 'text-green-600' : 'text-amber-600'} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.receipt_number}</p>
                        <p className="text-[10px] text-gray-400">{r.subscription_number} · {fmtD(r.issued_at)} · {r.paid_by_name || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-bold text-gray-900">{fmtA(r.amount_paid, r.currency_symbol)}</p>
                      {r.confirmed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800"><CheckCircle size={10} /> Confirmed</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800"><Clock size={10} /> Pending</span>
                      )}
                      {isExpanded ? <ChevronDown size={14} className="text-gray-400 rotate-180" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-xs text-gray-500">Subscriber</p><p className="font-semibold">{r.subscriber_name || '—'}</p><p className="text-[10px] text-gray-400 capitalize">{r.subscriber_type?.replace('_', ' ')}</p></div>
                        <div><p className="text-xs text-gray-500">Payment Method</p><p className="font-semibold capitalize">{r.payment_method?.replace('_', ' ')}</p></div>
                        <div><p className="text-xs text-gray-500">Transaction Ref</p><p className="font-semibold font-mono text-xs">{r.payment_ref_id || r.transaction_ref || '—'}</p></div>
                        <div><p className="text-xs text-gray-500">Invoice</p><p className="font-semibold">{r.invoice_ref_no || '—'}</p></div>
                        {r.change_given > 0 && <div><p className="text-xs text-gray-500">Change Given</p><p className="font-semibold">{fmtA(r.change_given, r.currency_symbol)}</p></div>}
                        {r.confirmed_by_name && <div><p className="text-xs text-gray-500">Confirmed By</p><p className="font-semibold">{r.confirmed_by_name} · {fmtD(r.confirmed_at)}</p></div>}
                      </div>
                      {r.notes && <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600">{r.notes}</div>}
                      <div className="flex items-center gap-2">
                        <button onClick={() => viewReceipt(r)}
                          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                          <Receipt size={14} /> View
                        </button>
                        <button onClick={() => downloadReceipt(r)} disabled={downloadingId === r.id}
                          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                          {downloadingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={14} />}
                          {downloadingId === r.id ? 'PDF…' : 'PDF'}
                        </button>
                        {!r.confirmed && (
                          <button onClick={() => handleConfirm(r.id)} disabled={confirming === r.id}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                            {confirming === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Confirm Receipt
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Pagination page={page} pageSize={pageSize} totalCount={total} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════════

export default function AdminSubscriptionsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={28} /></div>}>
      <AdminSubscriptionsPage />
    </Suspense>
  )
}

function AdminSubscriptionsPage() {
    const supabase = createClient()
    const searchParams = useSearchParams()
    const initialTab = searchParams?.get('tab') || 'overview'
    const deepLinkedReceipt = searchParams?.get('receipt') || null
    const [tab, setTab] = useState(initialTab)

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
                <p className="text-gray-500 text-sm mt-1">Manage subscription packages, pricing, discounts, and subscriber lifecycle</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-wrap mb-6">
                {TABS.map(t => {
                    const Icon = t.icon
                    return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-w-fit ${tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}>
                            <Icon size={14} /> {t.label}
                        </button>
                    )
                })}
            </div>

            {/* Tab content */}
            {tab === 'overview' && <OverviewTab supabase={supabase} />}
            {tab === 'list' && <SubscriptionsListTab supabase={supabase} />}
            {tab === 'packages' && <PackagesTab supabase={supabase} />}
            {tab === 'tiers' && <PricingTiersTab supabase={supabase} />}
            {tab === 'discounts' && <DiscountsTab supabase={supabase} />}
            {tab === 'trials' && <TrialConfigTab supabase={supabase} />}
            {tab === 'shops' && <ShopTiersTab supabase={supabase} />}
            {tab === 'invoices' && <InvoicesTab supabase={supabase} />}
            {tab === 'receipts' && <ReceiptsTab supabase={supabase} deepLinkedReceipt={deepLinkedReceipt} />}
            {tab === 'calculator' && <CalculatorTab supabase={supabase} />}
        </div>
    )
}