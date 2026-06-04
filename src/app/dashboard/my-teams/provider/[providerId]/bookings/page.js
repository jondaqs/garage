'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar, Filter, Search, ArrowLeft, AlertCircle, Loader2, Shield, ChevronLeft, ChevronRight
} from 'lucide-react'
import BookingCard from '@/components/bookings/BookingCard'

export default function MemberProviderBookingsPage() {
  const params   = useParams()
  const router   = useRouter()
  const supabase = createClient()

  const providerId = params.providerId

  const [authChecked,  setAuthChecked]  = useState(false)
  const [authError,    setAuthError]    = useState('')
  const [provider,     setProvider]     = useState(null)
  const [membership,   setMembership]   = useState(null)
  const [bookings,     setBookings]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery,  setSearchQuery]  = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  // ── Verify the user is an active member of THIS provider ───────────────
  useEffect(() => {
    if (!providerId) return
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }

        const { data: profile } = await supabase
          .from('user_profiles_secure').select('id').eq('auth_user_id', user.id).single()
        if (!profile) {
          setAuthError('Profile not found')
          setAuthChecked(true)
          return
        }

        const [{ data: spu }, { data: mech }] = await Promise.all([
          supabase.from('service_provider_users')
            .select('role, can_approve_work, can_chat')
            .eq('service_provider_id', providerId)
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .maybeSingle(),
          supabase.from('mechanics')
            .select('role, can_approve_work, can_chat')
            .eq('service_provider_id', providerId)
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .maybeSingle(),
        ])

        if (!spu && !mech) {
          setAuthError("You aren't a member of this service provider.")
          setAuthChecked(true)
          return
        }

        setMembership({
          role:             spu?.role || mech?.role || 'mechanic',
          can_approve_work: !!(spu?.can_approve_work || mech?.can_approve_work),
          can_chat:         !!(spu?.can_chat || mech?.can_chat),
        })

        const { data: prov } = await supabase
          .from('service_providers_secure').select('id, name')
          .eq('id', providerId).maybeSingle()
        setProvider(prov)

        setAuthChecked(true)
        loadBookings()
      } catch (e) {
        setAuthError(e.message)
        setAuthChecked(true)
      }
    })()
  }, [providerId, router])

  // ── Load bookings (RLS permits any active member to read) ──────────────
  const loadBookings = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('bookings_secure')
        .select(`
          *,
          customer:user_profiles!customer_user_id(first_name, last_name, phone),
          shop:shops(name),
          vehicle:vehicles(plate_number, make, model),
          status:booking_statuses(code, display_name, color_code),
          booking_services(service:services(name))
        `)
        .eq('service_provider_id', providerId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setBookings(data || [])
    } catch (err) {
      console.error('Member bookings load error:', err)
    } finally {
      setLoading(false)
    }
  }, [providerId])

  // ── Filter + search ────────────────────────────────────────────────────
  const filteredBookings = bookings.filter(b => {
    const matchesStatus = statusFilter === 'all' || b.status?.code === statusFilter
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q
      || b.booking_number?.toLowerCase().includes(q)
      || b.customer?.first_name?.toLowerCase().includes(q)
      || b.customer?.last_name?.toLowerCase().includes(q)
      || b.vehicle?.plate_number?.toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })

  useEffect(() => { setPage(1) }, [statusFilter, searchQuery, pageSize])
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize))
  const paginated  = filteredBookings.slice((page - 1) * pageSize, page * pageSize)

  // ── Render gates ───────────────────────────────────────────────────────
  if (!authChecked) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="animate-spin h-10 w-10 text-blue-600" />
    </div>
  )

  if (authError) return (
    <div className="max-w-2xl mx-auto p-6">
      <button onClick={() => router.push('/dashboard/my-teams')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 text-sm">
        <ArrowLeft size={16} /> Back to My Teams
      </button>
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
        <div>
          <p className="font-semibold text-red-900">Access denied</p>
          <p className="text-sm text-red-700 mt-1">{authError}</p>
        </div>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="animate-spin h-10 w-10 text-blue-600" />
    </div>
  )

  // ── Pending count for the heading ──────────────────────────────────────
  const pendingCount = bookings.filter(b => b.status?.code === 'pending').length

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

      {/* Back link */}
      <button
        onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={15} /> Back to {provider?.name || 'Provider'}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-500 mt-0.5">
            <span className="font-medium text-gray-700 truncate">{provider?.name}</span>
            <span>·</span>
            <span className="capitalize">{membership?.role?.replace(/_/g, ' ')}</span>
            {membership?.can_approve_work && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-semibold flex items-center gap-1">
                <Shield size={9} /> WO access
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {bookings.length} total
            {pendingCount > 0 && (
              <> · <span className="text-amber-700 font-medium">{pendingCount} pending</span></>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by number, customer, or plate…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg
                         focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg
                         focus:ring-2 focus:ring-blue-500 text-sm appearance-none bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      {filteredBookings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm">
          <Calendar className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No bookings found</h3>
          <p className="text-gray-500 text-sm">
            {bookings.length === 0
              ? `${provider?.name || 'This provider'} hasn't received any bookings yet.`
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {paginated.map(booking => (
              <BookingCard
                key={booking.id}
                booking={booking}
                isProvider
                onClick={() => router.push(
                  `/dashboard/my-teams/provider/${providerId}/bookings/${booking.id}`
                )}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-4 bg-white rounded-lg shadow-sm px-5 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Show</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
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
              <p className="text-xs text-gray-400">{(page-1)*pageSize+1}–{Math.min(page*pageSize, filteredBookings.length)} of {filteredBookings.length}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}