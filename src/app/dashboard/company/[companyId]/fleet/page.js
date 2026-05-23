'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Truck, Plus, Calendar, AlertCircle } from 'lucide-react'

export default function MemberFleetPage() {
  const { companyId } = useParams()
  const router  = useRouter()
  const supabase = createClient()

  const [fleet,      setFleet]      = useState([])
  const [membership, setMembership] = useState(null)
  // Set of vehicle ids that currently have a pending deletion request.
  // Used to badge cards as "pending deletion" so members see the state.
  const [pendingIds, setPendingIds] = useState(() => new Set())
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  useEffect(() => { fetchData() }, [companyId])

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!profile) return

      // Verify membership
      const { data: mem } = await supabase
        .from('company_users')
        .select('is_admin, staff_role, can_manage_fleet')
        .eq('user_id', profile.id)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle()

      if (!mem) { setError('You are not a member of this company.'); setLoading(false); return }
      setMembership(mem)

      // Fetch fleet (deactivated vehicles are naturally excluded — their
      // vehicle_ownership row is moved to vehicle_ownership_history on
      // deactivation, so they drop out of this join).
      const { data: fleetData, error: fleetErr } = await supabase
        .from('vehicle_ownership')
        .select(`
          vehicle_id,
          vehicle:vehicles(id, plate_number, make, model, year_of_manufacture, color, created_at)
        `)
        .eq('owner_company_id', companyId)

      if (fleetErr) throw fleetErr
      setFleet(fleetData ?? [])

      // Mark vehicles with pending deletion requests so we can badge them.
      // RLS limits this to requests on the caller's company.
      const { data: pending } = await supabase
        .from('fleet_deletion_requests')
        .select('vehicle_id')
        .eq('company_id', companyId)
        .eq('status', 'pending')
      setPendingIds(new Set((pending ?? []).map(p => p.vehicle_id)))
    } catch (err) {
      setError('Failed to load fleet.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center py-24">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700 flex items-center gap-3">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <p>{error}</p>
    </div>
  )

  // canManageFleet: company admins always pass; non-admin members pass when
  // their company_users.can_manage_fleet flag is set. Mirrors the server-side
  // gate on add_fleet_vehicle_with_ownership and update_fleet_vehicle.
  const canManageFleet = !!(membership?.is_admin || membership?.can_manage_fleet)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Fleet</h1>
          <p className="text-sm text-gray-500 mt-1">
            {fleet.length} vehicle{fleet.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        {canManageFleet && (
          <Link
            href={`/dashboard/company/${companyId}/fleet/add`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Vehicle
          </Link>
        )}
      </div>

      {fleet.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Truck className="w-14 h-14 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles in the fleet</h3>
          <p className="text-gray-500">
            {canManageFleet
              ? 'Add the first vehicle to get started.'
              : 'Ask a company admin to add vehicles.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {fleet.map(item => {
            const isPending = pendingIds.has(item.vehicle_id)
            return (
              <Link
                key={item.vehicle_id}
                href={`/dashboard/company/${companyId}/fleet/${item.vehicle_id}`}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow block"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Truck className="w-5 h-5 text-blue-600" />
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
                <h3 className="font-bold text-lg text-gray-900 mb-1">
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
      )}
    </div>
  )
}