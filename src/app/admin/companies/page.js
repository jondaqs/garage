'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Building2, Users, Truck, Clock, MoreVertical, ShieldOff, ShieldCheck } from 'lucide-react'
import Pagination from '@/components/admin/Pagination'

const PAGE_SIZE = 20

/* ── Fixed-position action menu ──────────────────────────────────────────── */
function ActionMenu({ actions, onAction, entityId, entityName, processing }) {
  const [open, setOpen]   = useState(false)
  const [pos, setPos]     = useState({ top: 0, left: 0 })
  const btnRef            = useRef(null)
  const menuRef           = useRef(null)

  const toggle = useCallback(() => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.right })
    }
    setOpen(o => !o)
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          btnRef.current && !btnRef.current.contains(e.target)) close()
    }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  if (actions.length === 0) return null

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        disabled={processing}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-100%)' }}
          className="w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] py-1"
        >
          {actions.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.key}
                onClick={() => { setOpen(false); onAction(entityId, a.key, entityName) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${a.cls}`}
              >
                <Icon size={14} /> {a.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function AdminCompaniesPage() {
  const [companies,  setCompanies]  = useState([])
  const [filter,     setFilter]     = useState('pending_verification')
  const [loading,    setLoading]    = useState(true)
  const [page,       setPage]       = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [processing, setProcessing] = useState(null)

  useEffect(() => { setPage(1) }, [filter])
  useEffect(() => { fetchCompanies() }, [filter, page])

  const fetchCompanies = async () => {
    setLoading(true)
    const supabase = createClient()
    const from = (page - 1) * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from('company_profiles')
      .select('id, name, registration_number, status, is_active, is_suspended, submitted_at, created_at, owner_user_id, owner:user_profiles!company_profiles_owner_user_id_fkey(first_name, last_name, email)', { count: 'exact' })
      .order('submitted_at', { ascending: false, nullsFirst: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    query = query.range(from, to)
    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching companies:', error)
      setLoading(false)
      return
    }

    setTotalCount(count || 0)

    const companiesWithCounts = await Promise.all(
      (data || []).map(async (company) => {
        const supabase2 = createClient()
        const [{ count: vehicleCount }, { count: teamCount }] = await Promise.all([
          supabase2
            .from('vehicle_ownership')
            .select('*', { count: 'exact', head: true })
            .eq('owner_company_id', company.id),
          supabase2
            .from('company_users')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id),
        ])
        return { ...company, vehicleCount: vehicleCount || 0, teamCount: teamCount || 0 }
      })
    )

    setCompanies(companiesWithCounts)
    setLoading(false)
  }

  // ── Admin actions ─────────────────────────────────────────────────────────
  const handleAction = async (companyId, action, companyName) => {
    const labels = {
      suspend:  `Suspend ${companyName}? All team members will be deactivated.`,
      activate: `Activate ${companyName}? All team members will be reactivated.`,
    }
    if (!confirm(labels[action])) return

    setProcessing(companyId)
    const supabase = createClient()

    try {
      const statusMap = { suspend: 'suspended', activate: 'active' }
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase.rpc('admin_update_company_status', {
        p_company_id:  companyId,
        p_status:      statusMap[action],
        p_verified_by: user.id,
      })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error)

      // Log admin action
      const { data: adminProfile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      if (adminProfile) {
        await supabase.from('admin_action_logs').insert({
          admin_user_id: adminProfile.id,
          action_type:   action + '_company',
          target_type:   'company',
          target_id:     companyId,
          action_data:   { company_name: companyName },
        })
      }

      // Notify company owner
      const company = companies.find(c => c.id === companyId)
      if (company?.owner_user_id) {
        const title   = action === 'suspend' ? 'Company Suspended' : 'Company Activated'
        const message = action === 'suspend'
          ? `${companyName} has been suspended by an administrator. Contact support for more information.`
          : `${companyName} has been activated and is now fully operational.`
        await supabase.from('notifications').insert({
          user_id: company.owner_user_id,
          recipient_user_id: company.owner_user_id,
          type: 'company_' + action + 'd',
          notification_type: 'company_' + action + 'd',
          reference_type: 'company',
          reference_id: companyId,
          title, message, is_read: false,
        })
      }

      await fetchCompanies()
    } catch (err) {
      console.error(`${action} failed:`, err)
      alert(`Failed to ${action} company: ${err.message}`)
    } finally {
      setProcessing(null)
    }
  }

  const getActions = (c) => {
    const actions = []
    if (c.status === 'active') {
      actions.push({ key: 'suspend', label: 'Suspend', icon: ShieldOff, cls: 'text-red-700 hover:bg-red-50' })
    }
    if (c.status === 'suspended') {
      actions.push({ key: 'activate', label: 'Activate', icon: ShieldCheck, cls: 'text-green-700 hover:bg-green-50' })
    }
    return actions
  }

  const statusConfig = {
    pending_verification: { label: 'Pending', classes: 'bg-yellow-100 text-yellow-800' },
    active:               { label: 'Active',  classes: 'bg-green-100 text-green-800' },
    rejected:             { label: 'Rejected', classes: 'bg-red-100 text-red-800' },
    pending_info:         { label: 'Needs Info', classes: 'bg-orange-100 text-orange-800' },
    suspended:            { label: 'Suspended', classes: 'bg-gray-100 text-gray-700' },
  }

  const filters = [
    { key: 'all',                  label: 'All' },
    { key: 'pending_verification', label: 'Pending' },
    { key: 'pending_info',         label: 'Needs Info' },
    { key: 'active',               label: 'Active' },
    { key: 'suspended',            label: 'Suspended' },
    { key: 'rejected',             label: 'Rejected' },
  ]

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Registrations</h1>
          <p className="text-gray-500 text-sm mt-1">Review and manage company accounts</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Building2 className="w-4 h-4" />
          <span>{totalCount} total</span>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && page === 1 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          Loading companies...
        </div>
      ) : companies.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No companies with status "{filter.replace(/_/g, ' ')}"</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="min-w-[850px] w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Fleet</span>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Team</span>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Submitted</span>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {companies.map((company) => {
                  const cfg     = statusConfig[company.status] || { label: company.status, classes: 'bg-gray-100 text-gray-700' }
                  const actions = getActions(company)

                  return (
                    <tr key={company.id} className={`hover:bg-gray-50 ${processing === company.id ? 'opacity-50 pointer-events-none' : ''}`}>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="font-medium text-gray-900 truncate max-w-[200px]">{company.name}</div>
                        {company.registration_number && (
                          <div className="text-xs text-gray-400 mt-0.5">{company.registration_number}</div>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {company.owner?.first_name} {company.owner?.last_name}
                        </div>
                        {company.owner?.email && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{company.owner.email}</div>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap ${cfg.classes}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-700">{company.vehicleCount}</td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-700">{company.teamCount}</td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500">
                        {company.submitted_at
                          ? new Date(company.submitted_at).toLocaleDateString()
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/admin/companies/${company.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium whitespace-nowrap">
                            Review
                          </Link>
                          <ActionMenu
                            actions={actions}
                            onAction={handleAction}
                            entityId={company.id}
                            entityName={company.name}
                            processing={processing === company.id}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}