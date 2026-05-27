'use client'

import PendingInvitationsCard from '@/components/PendingInvitationsCard'
import PendingCompanyInvitationsCard from '@/components/PendingCompanyInvitationsCard'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Car, Calendar, BarChart3, DollarSign, Plus, ChevronDown, ChevronUp, RotateCcw, AlertCircle, ArrowRight } from 'lucide-react'
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
  const [totalVehicles, setTotalVehicles] = useState(0)

  // ── Inactive (soft-deleted) vehicles ──────────────────────────────────
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
          setTotalVehicles(0)
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
          const mappedVehicles = (vehiclesData || []).map(v => ({
            ...v,
            year: v.year_of_manufacture
          }))
          setVehicles(mappedVehicles)
          setTotalVehicles(mappedVehicles?.length || 0)
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

      setInactiveVehicles(prev => prev.filter(row => row.vehicle_id !== vehicleId))

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
        setTotalVehicles(mapped.length)
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

        {/* Inactive vehicles — collapsible */}
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
    {/* ================= DESKTOP ================= */}
    <div className="hidden md:block">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-800 mb-8">
          Welcome back, {userName}! 👋
        </h2>

        {/* Stats strip — 1 real stat + 3 navigation cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {/* Total Vehicles — real data */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Total Vehicles</span>
              <Car className="text-blue-600" size={24} />
            </div>
            <p className="text-3xl font-bold text-gray-800">{totalVehicles}</p>
          </div>

          {/* Bookings — link card */}
          <button
            onClick={() => router.push('/dashboard/bookings')}
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-green-300 transition text-left group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Bookings</span>
              <Calendar className="text-green-600" size={24} />
            </div>
            <p className="text-sm text-gray-500 mb-2">View and manage your service bookings</p>
            <span className="text-green-600 text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              See Bookings <ArrowRight size={14} />
            </span>
          </button>

          {/* Reports — link card */}
          <button
            onClick={() => router.push('/dashboard/reports')}
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-purple-300 transition text-left group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Service Reports</span>
              <BarChart3 className="text-purple-600" size={24} />
            </div>
            <p className="text-sm text-gray-500 mb-2">Work orders, providers, and downtime</p>
            <span className="text-purple-600 text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              See Reports <ArrowRight size={14} />
            </span>
          </button>

          {/* Budget — link card */}
          <button
            onClick={() => router.push('/dashboard/budget')}
            className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-orange-300 transition text-left group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600 text-sm">Budget & Spend</span>
              <DollarSign className="text-orange-600" size={24} />
            </div>
            <p className="text-sm text-gray-500 mb-2">Track spend limits and per-vehicle costs</p>
            <span className="text-orange-600 text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              See Budget <ArrowRight size={14} />
            </span>
          </button>
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

        {/* Inactive vehicles (collapsed by default) */}
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
              <BarChart3 className="text-blue-600 mb-3 group-hover:scale-110 transition" size={32} />
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