'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Truck, Plus, Calendar, RotateCcw, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertCircle
} from 'lucide-react'

const supabase = createClient()

export default function FleetPage() {
  const [fleet, setFleet] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  // Set of vehicle_ids with a pending deletion request.
  const [pendingIds, setPendingIds] = useState(() => new Set())
  // Inactive (soft-deleted) vehicles for this company — only fetched if
  // the owner expands the inactive section.
  const [inactiveFleet, setInactiveFleet] = useState([])
  const [showInactive,  setShowInactive]  = useState(false)
  const [loadingInactive, setLoadingInactive] = useState(false)

  const [companyId, setCompanyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => { fetchFleet() }, [])

  const fetchFleet = async () => {
    try {
      // Active fleet (existing API route)
      const response = await fetch('/api/company/fleet')
      const data = await response.json()

      if (!data.success) {
        setError(data.error || 'Failed to load fleet')
        return
      }
      setFleet(data.fleet)

      // Resolve company id locally so we can use RLS-protected queries for
      // the pending/inactive lookups. Owner is the only audience here, so
      // company_profiles.owner_user_id is the cleanest path.
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
      const { data: owned } = await supabase
        .from('company_profiles').select('id').eq('owner_user_id', profile.id).maybeSingle()
      if (owned?.id) setCompanyId(owned.id)

      // Pending deletion requests — used for the badge on active cards.
      if (owned?.id) {
        const { data: pending } = await supabase
          .from('fleet_deletion_requests')
          .select('vehicle_id')
          .eq('company_id', owned.id)
          .eq('status', 'pending')
        setPendingIds(new Set((pending ?? []).map(p => p.vehicle_id)))
      }
    } catch (err) {
      console.error('Error fetching fleet:', err)
      setError('Failed to load fleet')
    } finally {
      setLoading(false)
    }
  }

  // Fetch inactive (soft-deleted) vehicles for this company. Joined via
  // vehicle_ownership_history — the deactivation RPC writes a history row
  // with owner_company_id and owned_until, so this is the canonical source.
  const fetchInactive = useCallback(async () => {
    if (!companyId) return
    setLoadingInactive(true)
    try {
      const { data, error: e } = await supabase
        .from('vehicle_ownership_history')
        .select(`
          vehicle_id, owned_until,
          vehicle:vehicles(
            id, plate_number, make, model, year_of_manufacture, color,
            is_active, deactivated_at
          )
        `)
        .eq('owner_company_id', companyId)
        .order('owned_until', { ascending: false })

      if (e) throw e
      // The history can in principle hold rows for vehicles that were
      // restored or sold to another party. We only want rows that are
      // *currently* inactive — i.e. vehicle.is_active = false.
      setInactiveFleet((data ?? []).filter(row => row.vehicle && row.vehicle.is_active === false))
    } catch (err) {
      console.error('Inactive fetch error:', err)
      setInactiveFleet([])
    } finally {
      setLoadingInactive(false)
    }
  }, [companyId])

  useEffect(() => {
    if (showInactive && companyId) fetchInactive()
  }, [showInactive, companyId, fetchInactive])

  const handleRestore = async (vehicleId) => {
    setActionError(null)
    try {
      const { data, error: e } = await supabase.rpc('restore_fleet_vehicle', {
        p_vehicle_id: vehicleId,
        p_company_id: companyId,
      })
      if (e) throw e
      if (data?.success === false) throw new Error(data.error || 'Restore failed')
      // Refresh both lists.
      await fetchFleet()
      if (showInactive) await fetchInactive()
    } catch (err) {
      setActionError(err?.message ?? 'Restore failed')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">{error}</div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Fleet</h1>
          <p className="text-sm text-gray-500 mt-1">
            {fleet.length} vehicle{fleet.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <Link
          href="/company/fleet/add"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Vehicle
        </Link>
      </div>

      {actionError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {fleet.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Truck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles in your fleet</h3>
          <p className="text-gray-500 mb-6">Get started by adding your first vehicle</p>
          <Link
            href="/company/fleet/add"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Your First Vehicle
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {fleet.slice((page - 1) * pageSize, page * pageSize).map((item) => {
            const isPending = pendingIds.has(item.vehicle_id)
            return (
              <Link
                key={item.vehicle_id}
                href={`/company/fleet/${item.vehicle_id}`}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Truck className="w-6 h-6 text-blue-600" />
                  </div>
                  {isPending ? (
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                      Pending deletion
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-lg mb-1 text-gray-900">
                  {item.vehicle?.plate_number || '—'}
                </h3>
                <p className="text-gray-600 text-sm">
                  {[item.vehicle?.year_of_manufacture, item.vehicle?.make, item.vehicle?.model]
                    .filter(Boolean).join(' ')}
                </p>
                {item.vehicle?.color && (
                  <p className="text-xs text-gray-400 mt-1 capitalize">{item.vehicle.color}</p>
                )}
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-1 text-xs text-gray-400">
                  <Calendar className="w-3 h-3" />
                  Added {item.vehicle?.created_at
                    ? new Date(item.vehicle.created_at).toLocaleDateString()
                    : '—'}
                </div>
              </Link>
            )
          })}
          </div>

          {Math.ceil(fleet.length / pageSize) > 1 && (() => {
            const totalPages = Math.ceil(fleet.length / pageSize)
            return (
              <div className="mt-6 flex items-center justify-between gap-4 bg-white rounded-lg shadow-sm px-5 py-3">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>Show</span>
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                    {[5, 10, 25].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let p; if (totalPages <= 5) p = i + 1; else if (page <= 3) p = i + 1; else if (page >= totalPages - 2) p = totalPages - 4 + i; else p = page - 2 + i
                    return <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded text-sm font-medium ${p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
                </div>
                <p className="text-xs text-gray-400">{(page-1)*pageSize+1}–{Math.min(page*pageSize, fleet.length)} of {fleet.length}</p>
              </div>
            )
          })()}
        </>
      )}

      {/* ─── Inactive vehicles (collapsed by default) ─────────────────────
          Only the owner can restore, so this section is owner-only by
          virtue of being on /company/fleet (members go through
          /dashboard/company/[id]/fleet which doesn't render this). ─── */}
      <div className="mt-8">
        <button
          onClick={() => setShowInactive(v => !v)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          {showInactive
            ? <ChevronUp size={16} className="text-gray-400" />
            : <ChevronDown size={16} className="text-gray-400" />}
          {showInactive ? 'Hide' : 'Show'} inactive vehicles
        </button>

        {showInactive && (
          <div className="mt-4">
            {loadingInactive ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : inactiveFleet.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No inactive vehicles.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inactiveFleet.map((row) => (
                  <div
                    key={row.vehicle_id}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-5 opacity-90"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2 bg-gray-200 rounded-lg">
                        <Truck className="w-5 h-5 text-gray-500" />
                      </div>
                      <span className="px-2.5 py-1 bg-gray-200 text-gray-600 text-xs font-medium rounded-full">
                        Inactive
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-gray-700 mb-1">
                      {row.vehicle?.plate_number || '—'}
                    </h3>
                    <p className="text-gray-500 text-sm">
                      {[row.vehicle?.year_of_manufacture, row.vehicle?.make, row.vehicle?.model]
                        .filter(Boolean).join(' ')}
                    </p>
                    {row.vehicle?.deactivated_at && (
                      <p className="text-xs text-gray-400 mt-2">
                        Deactivated {new Date(row.vehicle.deactivated_at).toLocaleDateString()}
                      </p>
                    )}
                    <button
                      onClick={() => handleRestore(row.vehicle_id)}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition"
                    >
                      <RotateCcw size={12} />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}