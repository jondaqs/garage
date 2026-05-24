// src/app/dashboard/page.js
// ALTERNATIVE SIMPLER APPROACH - Use this if the nested query fails

'use client'

import PendingInvitationsCard from '@/components/PendingInvitationsCard'
import PendingCompanyInvitationsCard from '@/components/PendingCompanyInvitationsCard'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Car, Calendar, Check, CreditCard, Plus, ChevronDown, ChevronUp, RotateCcw, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import MobileHeader from '../../components/MobileHeader'
import MobileVehicleCard from '../../components/MobileVehicleCard'
import MobileQuickActions from '../../components/MobileQuickActions'
import MobileBottomNav from '../../components/MobileBottomNav'



export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalVehicles: 0,
    activeBookings: 0,
    completedServices: 0,
    totalSpent: 0
  })

  // ── Inactive (soft-deleted) vehicles ──────────────────────────────────
  // Lazy-loaded only when the user expands the collapsible section,
  // mirroring the company owner fleet page. Source is
  // vehicle_ownership_history filtered by the caller's profile id.
  // profileId is captured from the same lookup in fetchData() so we can
  // reuse it for the lazy fetch + the restore RPC.
  const [profileId, setProfileId]               = useState(null)
  const [inactiveVehicles, setInactiveVehicles] = useState([])
  const [showInactive, setShowInactive]         = useState(false)
  const [loadingInactive, setLoadingInactive]   = useState(false)
  const [actionError, setActionError]           = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
          console.error('User error:', userError)
          router.push('/auth/login')
          return
        }

        setUser(user)

        // Step 1: Get or create user profile
        let userProfile = null
        const { data: existingProfile, error: profileFetchError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (existingProfile) {
          userProfile = existingProfile
        } else {
          // Create profile if doesn't exist
          const { data: newProfile, error: createError } = await supabase
            .from('user_profiles')
            .insert([{
              auth_user_id: user.id,
              first_name: user.user_metadata?.first_name || '',
              last_name: user.user_metadata?.last_name || '',
              phone: user.user_metadata?.phone || ''
            }])
            .select()
            .single()

          if (createError) {
            console.error('Error creating profile:', createError)
            setLoading(false)
            return
          }
          userProfile = newProfile
        }

        if (!userProfile) {
          console.error('No user profile found')
          setLoading(false)
          return
        }

        // Remember profile id for the inactive-vehicles lazy fetch and
        // the restore RPC below.
        setProfileId(userProfile.id)

        // Step 2: Get vehicle IDs owned by user
        const { data: ownerships, error: ownershipError } = await supabase
          .from('vehicle_ownership')
          .select('vehicle_id')
          .eq('owner_user_id', userProfile.id)

        if (ownershipError) {
          console.error('Ownership error:', ownershipError)
          setVehicles([])
          setLoading(false)
          return
        }

        if (!ownerships || ownerships.length === 0) {
          setVehicles([])
          setStats(prev => ({ ...prev, totalVehicles: 0 }))
          setLoading(false)
          return
        }

        // Step 3: Get vehicle details
        const vehicleIds = ownerships.map(o => o.vehicle_id)
        const { data: vehiclesData, error: vehiclesError } = await supabase
          .from('vehicles')
          .select('id, plate_number, make, model, year_of_manufacture, color, vin, created_at')
          .in('id', vehicleIds)
          .order('created_at', { ascending: false })

        if (vehiclesError) {
          console.error('Vehicles error:', vehiclesError)
          setVehicles([])
        } else {
          // Map year_of_manufacture to year for display
          const mappedVehicles = (vehiclesData || []).map(v => ({
            ...v,
            year: v.year_of_manufacture
          }))
          setVehicles(mappedVehicles)
          setStats(prev => ({
            ...prev,
            totalVehicles: mappedVehicles?.length || 0
          }))

          // Compute total spent from paid receipts for this user's vehicles
          if (mappedVehicles?.length > 0) {
            const vids = mappedVehicles.map(v => v.id)
            const { data: spendData } = await supabase
              .from('receipts')
              .select('amount_paid, invoice:invoices!invoice_id(vehicle_id, status)')
              .eq('invoice.status', 'paid')
              .in('invoice.vehicle_id', vids)
            const totalSpent = (spendData || []).reduce((sum, r) => sum + Number(r.amount_paid || 0), 0)
            setStats(prev => ({ ...prev, totalSpent }))
          }
        }

      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [supabase, router])

  // ── Inactive vehicles: lazy fetch + restore ──────────────────────────
  // Fetches from vehicle_ownership_history filtered by the caller's
  // profile id. We then narrow the result to rows whose vehicle is
  // *currently* inactive (is_active === false) — the history table can
  // also hold rows for vehicles that were restored or transferred to a
  // new owner, and those should not appear here.
  const fetchInactive = useCallback(async () => {
    if (!profileId) return
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
        .eq('owner_user_id', profileId)
        .order('owned_until', { ascending: false })

      if (e) throw e
      setInactiveVehicles(
        (data ?? []).filter(row => row.vehicle && row.vehicle.is_active === false)
      )
    } catch (err) {
      console.error('Inactive fetch error:', err)
      setInactiveVehicles([])
    } finally {
      setLoadingInactive(false)
    }
  }, [profileId, supabase])

  // Trigger the lazy fetch the first time the user expands, and refetch
  // whenever they re-expand after a restore (we clear the list on
  // restore so the next expand grabs the fresh state).
  useEffect(() => {
    if (showInactive && profileId) fetchInactive()
  }, [showInactive, profileId, fetchInactive])

  const handleRestore = async (vehicleId) => {
    setActionError(null)
    try {
      const { data, error: e } = await supabase.rpc('restore_personal_vehicle', {
        p_vehicle_id: vehicleId,
      })
      if (e) throw e
      if (data?.success === false) throw new Error(data.error || 'Restore failed')

      // Refresh inactive list locally (remove the restored row) and bump
      // the active list with a fresh fetch of vehicle_ownership.
      setInactiveVehicles(prev => prev.filter(row => row.vehicle_id !== vehicleId))

      // Re-pull active vehicles so the restored one appears in "My Vehicles"
      // without a full page reload.
      const { data: ownerships } = await supabase
        .from('vehicle_ownership')
        .select('vehicle_id')
        .eq('owner_user_id', profileId)
      if (ownerships && ownerships.length) {
        const ids = ownerships.map(o => o.vehicle_id)
        const { data: vs } = await supabase
          .from('vehicles')
          .select('id, plate_number, make, model, year_of_manufacture, color, vin, created_at')
          .in('id', ids)
          .order('created_at', { ascending: false })
        const mapped = (vs ?? []).map(v => ({ ...v, year: v.year_of_manufacture }))
        setVehicles(mapped)
        setStats(prev => ({ ...prev, totalVehicles: mapped.length }))
      }
    } catch (err) {
      setActionError(err?.message ?? 'Restore failed')
    }
  }

  const userName = user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'User'

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-8"></div>
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    )
  }

  return (
    <>
    {/* ================= MOBILE ================= */}
    <div className="md:hidden flex flex-col min-h-screen bg-gray-50">

      <MobileHeader userName={userName} />

      <main className="flex-1 overflow-y-auto px-6 py-5 pb-24 space-y-5">

        {/* Vehicles */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-base">My Cars</h2>
            <button
              onClick={() => router.push('/dashboard/vehicles/add')}
              className="bg-blue-600 text-white text-sm px-3 py-2 rounded-lg"
            >
              + Add Car
            </button>
          </div>

          {vehicles.length === 0 ? (
            <div className="bg-white p-6 rounded-xl text-center border">
              No vehicles added yet
            </div>
          ) : (
            <div className="space-y-3">
              {vehicles.map(vehicle => (
                <MobileVehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                />
              ))}
            </div>
          )}
        </section>

        {/* Inactive vehicles — collapsible. Same data + restore RPC as
            the desktop card, condensed into a list for narrow screens. */}
        <section>
          <button
            onClick={() => setShowInactive(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            {showInactive
              ? <ChevronUp size={16} className="text-gray-400" />
              : <ChevronDown size={16} className="text-gray-400" />}
            {showInactive ? 'Hide' : 'Show'} inactive vehicles
          </button>

          {actionError && showInactive && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {showInactive && (
            <div className="mt-3">
              {loadingInactive ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                </div>
              ) : inactiveVehicles.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No inactive vehicles.</p>
              ) : (
                <div className="space-y-2">
                  {inactiveVehicles.map((row) => (
                    <div
                      key={row.vehicle_id}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Car className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <p className="font-semibold text-sm text-gray-700 truncate">
                            {row.vehicle?.plate_number || '—'}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {[row.vehicle?.year_of_manufacture, row.vehicle?.make, row.vehicle?.model]
                            .filter(Boolean).join(' ') || '—'}
                        </p>
                        {row.vehicle?.deactivated_at && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Deactivated {new Date(row.vehicle.deactivated_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRestore(row.vehicle_id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition flex-shrink-0"
                      >
                        <RotateCcw size={11} />
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <MobileQuickActions router={router} />
      </main>

      <MobileBottomNav />
    </div>
    {/* ================= DESKTOP (UNCHANGED) ================= */}
    <div className="hidden md:block">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-800 mb-8">
          Welcome back, {userName}! 👋
        </h2>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Total Vehicles</span>
              <Car className="text-blue-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{stats.totalVehicles}</p>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Active Bookings</span>
              <Calendar className="text-green-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{stats.activeBookings}</p>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Completed Services</span>
              <Check className="text-purple-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{stats.completedServices}</p>
          </div>

          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Total Spent</span>
              <CreditCard className="text-orange-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">KSh {stats.totalSpent.toLocaleString()}</p>
          </div>
        </div>

        {/* Vehicles */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-800">My Vehicles</h3>
            <button
              onClick={() => router.push('/dashboard/vehicles/add')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center shadow-sm"
            >
              <Plus size={20} className="mr-2" />
              Add Vehicle
            </button>
          </div>

          {vehicles.length === 0 ? (
            <div className="text-center py-12">
              <Car className="mx-auto text-gray-400 mb-4" size={48} />
              <p className="text-gray-600 mb-4">No vehicles added yet</p>
              <button
                onClick={() => router.push('/dashboard/vehicles/add')}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Add your first vehicle →
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {vehicles.map(vehicle => (
                <div
                  key={vehicle.id}
                  onClick={() => router.push(`/dashboard/vehicles/${vehicle.id}`)}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-bold text-lg text-gray-800">{vehicle.plate_number}</h4>
                      <p className="text-gray-600">{vehicle.make} {vehicle.model}</p>
                    </div>
                    <div className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-sm font-medium">
                      {vehicle.year}
                    </div>
                  </div>

                  <div className="flex items-center text-sm text-gray-600 mb-4">
                    <span className="mr-4">Color: {vehicle.color}</span>
                    {vehicle.vin && <span className="text-xs">VIN: {vehicle.vin}</span>}
                  </div>

                  <div className="flex items-center gap-1 text-xs text-blue-500 font-medium">
                    <span>View details, edit or delete →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Inactive vehicles (collapsed by default) ─────────────────
            Mirrors the company owner fleet page. Lazy-loaded on expand,
            with a Restore button on each card. Restore goes through
            restore_personal_vehicle, which blocks restoring a vehicle
            that has been re-registered to another owner. ──────────── */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 mb-8">
          <button
            onClick={() => setShowInactive(v => !v)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            {showInactive
              ? <ChevronUp size={16} className="text-gray-400" />
              : <ChevronDown size={16} className="text-gray-400" />}
            {showInactive ? 'Hide' : 'Show'} inactive vehicles
          </button>

          {actionError && showInactive && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {showInactive && (
            <div className="mt-4">
              {loadingInactive ? (
                <div className="flex justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : inactiveVehicles.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No inactive vehicles.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveVehicles.map((row) => (
                    <div
                      key={row.vehicle_id}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-5 opacity-90"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-gray-200 rounded-lg">
                          <Car className="w-5 h-5 text-gray-500" />
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

        <PendingCompanyInvitationsCard />

        <PendingInvitationsCard />

        {/* Quick Actions */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-6">Quick Actions</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <button 
              onClick={() => router.push('/dashboard/bookings')}
              className="border-2 border-gray-200 rounded-lg p-6 hover:border-blue-600 hover:bg-blue-50 transition text-left group"
            >
              <Calendar className="text-blue-600 mb-3 group-hover:scale-110 transition" size={32} />
              <h4 className="font-bold text-gray-800 mb-2">Book Service</h4>
              <p className="text-sm text-gray-600">Schedule maintenance for your vehicle</p>
            </button>

            <button 
              onClick={() => router.push('/dashboard/providers')}
              className="border-2 border-gray-200 rounded-lg p-6 hover:border-blue-600 hover:bg-blue-50 transition text-left group"
            >
              <Car className="text-blue-600 mb-3 group-hover:scale-110 transition" size={32} />
              <h4 className="font-bold text-gray-800 mb-2">Find Garages</h4>
              <p className="text-sm text-gray-600">Discover nearby service providers</p>
            </button>

            <button 
              onClick={() => router.push('/dashboard/history')}
              className="border-2 border-gray-200 rounded-lg p-6 hover:border-blue-600 hover:bg-blue-50 transition text-left group"
            >
              <Check className="text-blue-600 mb-3 group-hover:scale-110 transition" size={32} />
              <h4 className="font-bold text-gray-800 mb-2">View History</h4>
              <p className="text-sm text-gray-600">Check past service records</p>
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}