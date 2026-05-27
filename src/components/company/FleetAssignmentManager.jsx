// → src/components/company/FleetAssignmentManager.jsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Truck, UserCheck, UserX, Search, ChevronDown, Check,
  AlertCircle, Loader2, Car, User, X, Filter, ArrowUpDown
} from 'lucide-react'

/**
 * Shared fleet-assignment UI component.
 *
 * Props:
 *  - canEdit   {boolean}  Whether the current user can assign/unassign
 *                          (owner, admin, or can_manage_fleet)
 *
 * This component calls /api/company/fleet/assign to fetch and mutate data.
 * It is used by both:
 *   • /company/fleet-assignments/page.js  (company-owner portal)
 *   • /dashboard/company/[companyId]/fleet-assignments/page.js  (member portal)
 */

export default function FleetAssignmentManager({ canEdit = false }) {
  const [fleet, setFleet]       = useState([])
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [actionMsg, setActionMsg] = useState(null)  // { type: 'success'|'error', text }

  // UI state
  const [searchQuery, setSearchQuery]   = useState('')
  const [filterStatus, setFilterStatus] = useState('all') // all | assigned | unassigned
  const [sortBy, setSortBy]             = useState('plate')  // plate | make | assigned
  const [openDropdown, setOpenDropdown] = useState(null) // vehicleId with open member picker
  const [memberSearch, setMemberSearch] = useState('')
  const [assigning, setAssigning]       = useState(null) // vehicleId currently being assigned

  // ── Fetch data ──────────────────────────────────────────────────────────
  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/company/fleet/assign')
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Failed to load'); return }
      setFleet(data.fleet || [])
      setMembers(data.members || [])
    } catch {
      setError('Failed to load fleet assignments')
    } finally {
      setLoading(false)
    }
  }

  // ── Assign / unassign ───────────────────────────────────────────────────
  const handleAssign = async (vehicleId, assignedUserId) => {
    setAssigning(vehicleId)
    setActionMsg(null)
    try {
      const res = await fetch('/api/company/fleet/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, assignedUserId: assignedUserId || null }),
      })
      const data = await res.json()
      if (!data.success) {
        setActionMsg({ type: 'error', text: data.error || 'Assignment failed' })
        return
      }
      setActionMsg({ type: 'success', text: data.message })
      setOpenDropdown(null)
      // Refresh data
      await fetchData()
    } catch {
      setActionMsg({ type: 'error', text: 'Network error' })
    } finally {
      setAssigning(null)
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────
  const filteredFleet = useMemo(() => {
    let result = [...fleet]

    // Text search on plate, make, model, assigned user name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(f => {
        const v = f.vehicle || {}
        const u = f.assignedUser || {}
        return (
          (v.plate_number || '').toLowerCase().includes(q) ||
          (v.make || '').toLowerCase().includes(q) ||
          (v.model || '').toLowerCase().includes(q) ||
          `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(q)
        )
      })
    }

    // Filter by assignment status
    if (filterStatus === 'assigned') {
      result = result.filter(f => f.assignedUserId)
    } else if (filterStatus === 'unassigned') {
      result = result.filter(f => !f.assignedUserId)
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'plate') return (a.vehicle?.plate_number || '').localeCompare(b.vehicle?.plate_number || '')
      if (sortBy === 'make') return `${a.vehicle?.make} ${a.vehicle?.model}`.localeCompare(`${b.vehicle?.make} ${b.vehicle?.model}`)
      if (sortBy === 'assigned') {
        const aName = a.assignedUser ? `${a.assignedUser.first_name} ${a.assignedUser.last_name}` : 'zzz'
        const bName = b.assignedUser ? `${b.assignedUser.first_name} ${b.assignedUser.last_name}` : 'zzz'
        return aName.localeCompare(bName)
      }
      return 0
    })

    return result
  }, [fleet, searchQuery, filterStatus, sortBy])

  // Members filtered for the picker dropdown
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members
    const q = memberSearch.toLowerCase()
    return members.filter(m =>
      `${m.firstName || ''} ${m.lastName || ''}`.toLowerCase().includes(q) ||
      (m.staffRole || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q)
    )
  }, [members, memberSearch])

  // Stats
  const stats = useMemo(() => ({
    total: fleet.length,
    assigned: fleet.filter(f => f.assignedUserId).length,
    unassigned: fleet.filter(f => !f.assignedUserId).length,
  }), [fleet])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('[data-fleet-dropdown]')) {
        setOpenDropdown(null)
        setMemberSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Render helpers ──────────────────────────────────────────────────────
  const roleBadge = (role) => {
    const colors = {
      owner:         'bg-indigo-50 text-indigo-700 border-indigo-200',
      driver:        'bg-blue-50 text-blue-700 border-blue-200',
      fleet_manager: 'bg-sky-50 text-sky-700 border-sky-200',
      accountant:    'bg-emerald-50 text-emerald-700 border-emerald-200',
      mechanic:      'bg-amber-50 text-amber-700 border-amber-200',
      other:         'bg-gray-50 text-gray-700 border-gray-200',
    }
    return colors[role] || colors.other
  }

  const formatRole = (role) => {
    if (!role) return 'Member'
    return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading fleet assignments…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Failed to load</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button onClick={fetchData}
              className="mt-3 text-sm font-medium text-red-700 hover:text-red-800 underline underline-offset-2">
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header + stats ─────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck className="h-6 w-6 text-blue-600" />
          Fleet Assignments
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {canEdit
            ? 'Assign company vehicles to team members.'
            : 'View which vehicles are assigned to which team members.'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Fleet</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-green-700">{stats.assigned}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Unassigned</p>
          </div>
          <p className="mt-1 text-2xl font-bold text-orange-600">{stats.unassigned}</p>
        </div>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-2 text-sm font-medium ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {actionMsg.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMsg.text}
          <button onClick={() => setActionMsg(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search plates, make, model, or member…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
            {[
              { value: 'all', label: 'All' },
              { value: 'assigned', label: 'Assigned' },
              { value: 'unassigned', label: 'Unassigned' },
            ].map(opt => (
              <button key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  filterStatus === opt.value
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <button
            onClick={() => {
              const order = ['plate', 'make', 'assigned']
              const next = order[(order.indexOf(sortBy) + 1) % order.length]
              setSortBy(next)
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            title={`Sorted by ${sortBy}`}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortBy === 'plate' ? 'Plate' : sortBy === 'make' ? 'Make' : 'Assignee'}
          </button>
        </div>
      </div>

      {/* ── Fleet table ────────────────────────────────────────────────── */}
      {filteredFleet.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Car className="h-12 w-12 text-gray-300 mx-auto" />
          <p className="mt-3 text-sm font-medium text-gray-900">
            {fleet.length === 0 ? 'No vehicles in fleet' : 'No matching vehicles'}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {fleet.length === 0
              ? 'Add vehicles to the fleet first, then come back to assign them.'
              : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Vehicle</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Details</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Assigned To</th>
                  {canEdit && (
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredFleet.map((item) => {
                  const v = item.vehicle || {}
                  const u = item.assignedUser
                  return (
                    <tr key={item.vehicleId} className="hover:bg-gray-50/50 transition-colors">
                      {/* Vehicle */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <Car className="h-4.5 w-4.5 text-blue-600" size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{v.plate_number}</p>
                            <p className="text-xs text-gray-500">{v.make} {v.model}</p>
                          </div>
                        </div>
                      </td>
                      {/* Details */}
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-600">
                          {v.year_of_manufacture || '—'}{v.color ? ` · ${v.color}` : ''}
                        </p>
                      </td>
                      {/* Status */}
                      <td className="px-5 py-4">
                        {u ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                            Unassigned
                          </span>
                        )}
                      </td>
                      {/* Assigned To */}
                      <td className="px-5 py-4">
                        {u ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {u.profile_picture_url ? (
                                <img src={u.profile_picture_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <User className="h-3.5 w-3.5 text-gray-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {u.first_name} {u.last_name}
                              </p>
                              {item.assignedAt && (
                                <p className="text-[11px] text-gray-400">
                                  Since {new Date(item.assignedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 italic">No one</span>
                        )}
                      </td>
                      {/* Action */}
                      {canEdit && (
                        <td className="px-5 py-5 text-right">
                          <div className="relative inline-block" data-fleet-dropdown>
                            {u ? (
                              <div className="flex items-center gap-2 justify-end">
                                <button
                                  onClick={() => handleAssign(item.vehicleId, null)}
                                  disabled={assigning === item.vehicleId}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                                >
                                  {assigning === item.vehicleId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <UserX className="h-3 w-3" />
                                  )}
                                  Unassign
                                </button>
                                <button
                                  onClick={() => { setOpenDropdown(openDropdown === item.vehicleId ? null : item.vehicleId); setMemberSearch('') }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                                >
                                  <ArrowUpDown className="h-3 w-3" />
                                  Reassign
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setOpenDropdown(openDropdown === item.vehicleId ? null : item.vehicleId); setMemberSearch('') }}
                                disabled={assigning === item.vehicleId}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                              >
                                {assigning === item.vehicleId ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <UserCheck className="h-3 w-3" />
                                )}
                                Assign
                              </button>
                            )}

                            {/* Member picker dropdown */}
                            {openDropdown === item.vehicleId && (
                              <div className="absolute right-0 bottom-full mb-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
                                {/* Search within members */}
                                <div className="p-2 border-b border-gray-100">
                                  <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                    <input
                                      type="text"
                                      placeholder="Search members…"
                                      value={memberSearch}
                                      onChange={(e) => setMemberSearch(e.target.value)}
                                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      autoFocus
                                    />
                                  </div>
                                </div>

                                {/* Member list */}
                                <div className="max-h-56 overflow-y-auto">
                                  {filteredMembers.length === 0 ? (
                                    <p className="px-4 py-3 text-xs text-gray-500 text-center">No members found</p>
                                  ) : (
                                    filteredMembers.map(m => {
                                      const isCurrentAssignee = item.assignedUserId === m.userId
                                      return (
                                        <button
                                          key={m.userId}
                                          onClick={() => {
                                            if (!isCurrentAssignee) handleAssign(item.vehicleId, m.userId)
                                          }}
                                          disabled={isCurrentAssignee || assigning === item.vehicleId}
                                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                                            isCurrentAssignee ? 'bg-blue-50 cursor-default' : ''
                                          }`}
                                        >
                                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                            {m.profilePicture ? (
                                              <img src={m.profilePicture} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                              <User className="h-3.5 w-3.5 text-gray-500" />
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                              {m.firstName} {m.lastName}
                                            </p>
                                            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium border ${roleBadge(m.staffRole)}`}>
                                              {formatRole(m.staffRole)}
                                            </span>
                                          </div>
                                          {isCurrentAssignee && (
                                            <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                          )}
                                        </button>
                                      )
                                    })
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {filteredFleet.map((item) => {
              const v = item.vehicle || {}
              const u = item.assignedUser
              return (
                <div key={item.vehicleId} className="p-5 space-y-3 min-h-[120px]">
                  {/* Vehicle info */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Car className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{v.plate_number}</p>
                        <p className="text-xs text-gray-500">{v.make} {v.model} {v.year_of_manufacture || ''}</p>
                      </div>
                    </div>
                    {u ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Assigned
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                        Unassigned
                      </span>
                    )}
                  </div>

                  {/* Assigned user */}
                  {u && (
                    <div className="flex items-center gap-2 pl-[52px]">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {u.profile_picture_url ? (
                          <img src={u.profile_picture_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="h-3 w-3 text-gray-500" />
                        )}
                      </div>
                      <p className="text-sm text-gray-700">{u.first_name} {u.last_name}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {canEdit && (
                    <div className="pl-[52px] relative" data-fleet-dropdown>
                      {u ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAssign(item.vehicleId, null)}
                            disabled={assigning === item.vehicleId}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg disabled:opacity-50"
                          >
                            {assigning === item.vehicleId ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
                            Unassign
                          </button>
                          <button
                            onClick={() => { setOpenDropdown(openDropdown === item.vehicleId ? null : item.vehicleId); setMemberSearch('') }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg"
                          >
                            <ArrowUpDown className="h-3 w-3" /> Reassign
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setOpenDropdown(openDropdown === item.vehicleId ? null : item.vehicleId); setMemberSearch('') }}
                          disabled={assigning === item.vehicleId}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg disabled:opacity-50"
                        >
                          {assigning === item.vehicleId ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                          Assign Member
                        </button>
                      )}

                      {/* Mobile dropdown */}
                      {openDropdown === item.vehicleId && (
                        <div className="absolute left-0 bottom-full mb-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
                          <div className="p-2 border-b border-gray-100">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                              <input
                                type="text"
                                placeholder="Search members…"
                                value={memberSearch}
                                onChange={(e) => setMemberSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredMembers.length === 0 ? (
                              <p className="px-4 py-3 text-xs text-gray-500 text-center">No members found</p>
                            ) : (
                              filteredMembers.map(m => {
                                const isCurrentAssignee = item.assignedUserId === m.userId
                                return (
                                  <button
                                    key={m.userId}
                                    onClick={() => { if (!isCurrentAssignee) handleAssign(item.vehicleId, m.userId) }}
                                    disabled={isCurrentAssignee || assigning === item.vehicleId}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${isCurrentAssignee ? 'bg-blue-50' : ''}`}
                                  >
                                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                      {m.profilePicture ? (
                                        <img src={m.profilePicture} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <User className="h-3.5 w-3.5 text-gray-500" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">{m.firstName} {m.lastName}</p>
                                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium border ${roleBadge(m.staffRole)}`}>
                                        {formatRole(m.staffRole)}
                                      </span>
                                    </div>
                                    {isCurrentAssignee && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                                  </button>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Read-only notice ───────────────────────────────────────────── */}
      {!canEdit && fleet.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            You can view fleet assignments but only company owners, admins, or members with fleet management permissions can make changes.
          </p>
        </div>
      )}
    </div>
  )
}