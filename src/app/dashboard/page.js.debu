// src/app/dashboard/page.js
// ALTERNATIVE SIMPLER APPROACH - Use this if the nested query fails

'use client'

import PendingInvitationsCard from '@/components/PendingInvitationsCard'
import PendingCompanyInvitationsCard from '@/components/PendingCompanyInvitationsCard'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Car, Calendar, Check, CreditCard, Plus, Trash2 } from 'lucide-react'
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

  // ── DEBUG STATE ──────────────────────────────────────────────────────────
  const [debugLog, setDebugLog] = useState([])
  const [showDebug, setShowDebug] = useState(false)

  const log = (step, status, detail = '') => {
    const entry = { time: new Date().toISOString().slice(11,23), step, status, detail }
    console.log(`[DEBUG] ${entry.time} | ${step} | ${status}`, detail)
    setDebugLog(prev => [...prev, entry])
  }
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchData = async () => {
      try {
        log('init', 'started')

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        
        if (userError || !user) {
          log('auth', 'FAIL', userError?.message || 'no user returned')
          console.error('User error:', userError)
          router.push('/auth/login')
          return
        }

        log('auth', 'ok', `uid=${user.id} email=${user.email}`)
        setUser(user)

        // Step 1: Get or create user profile
        let userProfile = null
        const { data: existingProfile, error: profileFetchError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (profileFetchError) {
          log('profile_fetch', 'FAIL', profileFetchError.message)
        }

        if (existingProfile) {
          log('profile_fetch', 'ok', `profile_id=${existingProfile.id}`)
          userProfile = existingProfile
        } else {
          log('profile_fetch', 'not_found — attempting create')
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
            log('profile_create', 'FAIL', createError.message)
            console.error('Error creating profile:', createError)
            setLoading(false)
            return
          }
          log('profile_create', 'ok', `profile_id=${newProfile?.id}`)
          userProfile = newProfile
        }

        if (!userProfile) {
          log('profile', 'FAIL', 'null after fetch+create')
          console.error('No user profile found')
          setLoading(false)
          return
        }

        // Step 2: Get vehicle IDs owned by user
        const { data: ownerships, error: ownershipError } = await supabase
          .from('vehicle_ownership')
          .select('vehicle_id')
          .eq('owner_user_id', userProfile.id)

        if (ownershipError) {
          log('ownership_fetch', 'FAIL', ownershipError.message)
          console.error('Ownership error:', ownershipError)
          setVehicles([])
          setLoading(false)
          return
        }

        log('ownership_fetch', 'ok', `count=${ownerships?.length ?? 0}`)

        if (!ownerships || ownerships.length === 0) {
          log('vehicles', 'none', 'no ownership records found')
          setVehicles([])
          setStats(prev => ({ ...prev, totalVehicles: 0 }))
          setLoading(false)
          return
        }

        // Step 3: Get vehicle details
        const vehicleIds = ownerships.map(o => o.vehicle_id)
        log('vehicles_fetch', 'started', `ids=${vehicleIds.join(',')}`)

        const { data: vehiclesData, error: vehiclesError } = await supabase
          .from('vehicles')
          .select('id, plate_number, make, model, year_of_manufacture, color, vin, created_at')
          .in('id', vehicleIds)
          .order('created_at', { ascending: false })

        if (vehiclesError) {
          log('vehicles_fetch', 'FAIL', vehiclesError.message)
          console.error('Vehicles error:', vehiclesError)
          setVehicles([])
        } else {
          log('vehicles_fetch', 'ok', `count=${vehiclesData?.length ?? 0}`)
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
        }

        log('init', 'complete')

      } catch (error) {
        log('fetchData', 'UNCAUGHT_ERROR', error?.message || String(error))
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [supabase, router])

  const handleDeleteVehicle = async (vehicleId) => {
    if (!confirm('Are you sure you want to delete this vehicle?')) {
      return
    }

    try {
      // Delete vehicle ownership first
      const { error: ownershipError } = await supabase
        .from('vehicle_ownership')
        .delete()
        .eq('vehicle_id', vehicleId)

      if (ownershipError) {
        console.error('Ownership delete error:', ownershipError)
        throw ownershipError
      }

      // Delete vehicle
      const { error: vehicleError } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', vehicleId)

      if (vehicleError) {
        console.error('Vehicle delete error:', vehicleError)
        throw vehicleError
      }

      // Update local state
      setVehicles(vehicles.filter(v => v.id !== vehicleId))
      setStats(prev => ({
        ...prev,
        totalVehicles: prev.totalVehicles - 1
      }))

      alert('Vehicle deleted successfully!')
    } catch (error) {
      console.error('Error deleting vehicle:', error)
      alert('Failed to delete vehicle: ' + error.message)
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
                  onDelete={handleDeleteVehicle}
                  onBook={() => router.push('/dashboard/bookings')}
                />
              ))}
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
                <div key={vehicle.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
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

                  <div className="flex gap-2">
                    <button 
                      onClick={() => router.push('/dashboard/bookings')}
                      className="flex-1 bg-blue-50 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-100 transition font-medium flex items-center justify-center"
                    >
                      <Calendar size={18} className="mr-2" />
                      Book Service
                    </button>
                    
                    <button 
                      onClick={() => handleDeleteVehicle(vehicle.id)}
                      className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100 transition"
                      title="Delete vehicle"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
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
              onClick={() => alert('Find Garages feature coming soon!')}
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

    {/* ── DEBUG PANEL ── Remove this block once issue is identified ── */}
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      fontFamily: 'monospace', fontSize: 12,
    }}>
      <button
        onClick={() => setShowDebug(v => !v)}
        style={{
          background: debugLog.some(e => e.status.includes('FAIL') || e.status.includes('ERROR'))
            ? '#ef4444' : '#1d4ed8',
          color: '#fff', border: 'none', borderRadius: 8,
          padding: '6px 14px', cursor: 'pointer', fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        🐛 DEBUG {debugLog.length > 0 ? `(${debugLog.length})` : ''}
        {debugLog.some(e => e.status.includes('FAIL') || e.status.includes('ERROR')) ? ' ⚠️' : ''}
      </button>

      {showDebug && (
        <div style={{
          position: 'absolute', bottom: 40, right: 0,
          width: 480, maxHeight: 400, overflowY: 'auto',
          background: '#0f172a', color: '#e2e8f0',
          borderRadius: 12, padding: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          border: '1px solid #334155',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, color: '#93c5fd' }}>Dashboard Debug Log</span>
            <button onClick={() => setDebugLog([])} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              Clear
            </button>
          </div>
          {debugLog.length === 0 && (
            <p style={{ color: '#64748b' }}>No log entries yet — loading...</p>
          )}
          {debugLog.map((entry, i) => (
            <div key={i} style={{
              padding: '4px 0',
              borderBottom: '1px solid #1e293b',
              color: entry.status.includes('FAIL') || entry.status.includes('ERROR')
                ? '#f87171'
                : entry.status === 'ok' || entry.status === 'complete'
                  ? '#4ade80'
                  : '#fbbf24',
            }}>
              <span style={{ color: '#475569' }}>{entry.time} </span>
              <span style={{ color: '#93c5fd' }}>[{entry.step}] </span>
              <span style={{ fontWeight: 600 }}>{entry.status}</span>
              {entry.detail && (
                <span style={{ color: '#94a3b8' }}> — {String(entry.detail).slice(0, 120)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    {/* ── END DEBUG PANEL ── */}

    </>
  )
}