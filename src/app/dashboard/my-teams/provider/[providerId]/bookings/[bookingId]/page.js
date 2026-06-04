'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
    ArrowLeft, CheckCircle, XCircle, Flag, AlertCircle,
    Calendar, MapPin, Car, Phone, Mail, MessageSquare,
    ClipboardList, ExternalLink, Loader2, Shield, Lock
} from 'lucide-react'
import StatusBadge from '@/components/bookings/StatusBadge'

// Booking write actions (accept → create WO, reject, etc.) require WO
// approval permission. Only the most senior roles bypass the can_approve_work
// flag — accountants are NOT auto-qualified here.
const ADMIN_ROLES = new Set(['service_provider_owner', 'admin'])
// Managing an EXISTING work order is broader — accountants need to
// post-process invoicing, payments, etc., so they're included alongside
// owner/admin and the assigned mechanic.
const WO_MANAGER_ROLES = new Set(['service_provider_owner', 'admin', 'accountant'])

/**
 * Member-side booking detail page.
 *
 * Permission rules — implemented via derived flags:
 *
 *   canAcceptBooking ─ owner/admin role OR can_approve_work
 *      → Accept & Create Work Order, Reject Booking
 *      (Accountants are NOT auto-qualified here — they need can_approve_work too.)
 *
 *   canUpdateStatus  ─ same as canAcceptBooking
 *      → Mark Complete (legacy in_progress-without-WO path)
 *
 *   canManageWO      ─ owner/admin/accountant role OR member is the assigned mechanic
 *      → Manage Work Order / Open Work Order buttons
 *
 *   canSendMessage   ─ admin/accountant role OR can_chat
 *      → message thread input
 *
 * Buttons the member cannot use are rendered DISABLED with a tooltip
 * explaining why, rather than hidden — discoverable, less confusing.
 */
export default function MemberBookingDetailPage() {
    const router = useRouter()
    const params = useParams()
    const supabase = createClient()

    const providerId = params.providerId
    const bookingId = params.bookingId

    // ── Auth & permission state ────────────────────────────────────────────
    const [authChecked, setAuthChecked] = useState(false)
    const [authError, setAuthError] = useState('')
    const [provider, setProvider] = useState(null)
    const [membership, setMembership] = useState(null)
    const [myMechanicId, setMyMechanicId] = useState(null)  // null if user has no mechanic record

    // ── Booking + actions state ────────────────────────────────────────────
    const [booking, setBooking] = useState(null)
    const [woAssignment, setWoAssignment] = useState({ assigned_mechanic_id: null })
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [loading, setLoading] = useState(true)
    const [accepting, setAccepting] = useState(false)
    const [updating, setUpdating] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [successMsg, setSuccessMsg] = useState('')

    // ── 1. Resolve membership + mechanic id ─────────────────────────────────
    useEffect(() => {
        if (!providerId || !bookingId) return
            ; (async () => {
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
                            .select('role, can_approve_work, can_send_estimates, can_send_invoice, can_chat')
                            .eq('service_provider_id', providerId)
                            .eq('user_id', profile.id)
                            .eq('is_active', true)
                            .maybeSingle(),
                        supabase.from('mechanics')
                            .select('id, role, can_approve_work, can_send_estimates, can_send_invoice, can_chat')
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
                        role: spu?.role || mech?.role || 'mechanic',
                        can_approve_work: !!(spu?.can_approve_work || mech?.can_approve_work),
                        can_send_estimates: !!(spu?.can_send_estimates || mech?.can_send_estimates),
                        can_send_invoice: !!(spu?.can_send_invoice || mech?.can_send_invoice),
                        can_chat: !!(spu?.can_chat || mech?.can_chat),
                    })
                    setMyMechanicId(mech?.id || null)

                    const { data: prov } = await supabase
                        .from('service_providers_secure').select('id, name')
                        .eq('id', providerId).maybeSingle()
                    setProvider(prov)

                    setAuthChecked(true)
                    loadBooking()
                    loadMessages()
                } catch (e) {
                    setAuthError(e.message)
                    setAuthChecked(true)
                }
            })()
    }, [providerId, bookingId, router])

    // ── 2. Load booking ────────────────────────────────────────────────────
    const loadBooking = useCallback(async () => {
        try {
            setError('')
            const { data, error: fetchError } = await supabase
                .from('bookings_secure')
                .select(`
          *,
          customer:user_profiles!customer_user_id(first_name, last_name, phone, email),
          shop:shops(name, town, county, street),
          vehicle:vehicles(plate_number, make, model, year_of_manufacture),
          status:booking_statuses(code, display_name, color_code),
          booking_services(service:services(name))
        `)
                .eq('id', bookingId)
                .eq('service_provider_id', providerId)   // defence in depth — also enforced by RLS
                .maybeSingle()

            if (fetchError) { setError(fetchError.message || 'Failed to load booking'); return }
            if (!data) { setError('Booking not found, or not yours to view'); return }
            setBooking(data)

            // If linked to a WO, fetch its assigned_mechanic_id for the manage gate
            if (data.work_order_id) {
                const { data: wo } = await supabase
                    .from('work_orders_secure')
                    .select('id, assigned_mechanic_id, work_order_number, status:work_order_statuses(code, display_name)')
                    .eq('id', data.work_order_id)
                    .maybeSingle()
                if (wo) setWoAssignment(wo)
            }
        } catch {
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }, [bookingId, providerId])

    const loadMessages = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('booking_messages')
                .select('*, sender:user_profiles(first_name, last_name)')
                .eq('booking_id', bookingId)
                .order('created_at', { ascending: true })
            setMessages(data || [])
        } catch { }
    }, [bookingId])

    // ── 3. Derived permission flags ────────────────────────────────────────
    const isAdminRole = membership && ADMIN_ROLES.has(membership.role)         // owner/admin
    const isWOManagerRole = membership && WO_MANAGER_ROLES.has(membership.role)    // + accountant
    const isAssignedMechanic = !!myMechanicId && !!woAssignment?.assigned_mechanic_id
        && myMechanicId === woAssignment.assigned_mechanic_id
    // Booking writes — accountants are NOT auto-qualified; they need can_approve_work too.
    const canAcceptBooking = !!membership && (isAdminRole || membership.can_approve_work)
    const canUpdateStatus = canAcceptBooking
    // Manage existing WO — accountants ARE auto-qualified (alongside the assigned mechanic).
    const canManageWO = !!membership && (isWOManagerRole || isAssignedMechanic)
    const canSendMessage = !!membership && (isAdminRole || membership.can_chat)

    // ── 4. Action handlers ─────────────────────────────────────────────────
    const acceptAndCreateWorkOrder = async () => {
        if (!confirm('Accept this booking and create a work order?\nThe customer will be notified.')) return
        setAccepting(true)
        setError(''); setSuccessMsg('')
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const { data, error: fnError } = await supabase.rpc(
                'accept_booking_and_create_work_order',
                { p_booking_id: bookingId, p_provider_user_id: user.id }
            )
            if (fnError) throw fnError
            if (!data.success) throw new Error(data.error)

            // Fire email + SMS to customer (non-blocking)
            fetch(`/api/bookings/${bookingId}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'booking_accepted',
                    workOrderId: data.work_order_id,
                    workOrderNumber: data.work_order_number,
                }),
            }).catch(e => console.error('[memberBooking] notify failed (non-fatal):', e.message))

            setSuccessMsg(`Work order ${data.work_order_number} created!`)
            await loadBooking()
            // If the creator is allowed to manage the WO, send them there. Otherwise
            // stay on the booking page so they can hand off to the assigned mechanic.
            const newWoAssignedTo = data.assigned_mechanic_id || null
            const willBeAbleToManage =
                isWOManagerRole || (myMechanicId && newWoAssignedTo === myMechanicId)
            if (willBeAbleToManage) {
                setTimeout(() => {
                    router.push(`/dashboard/my-teams/work-order/${data.work_order_id}`)
                }, 1500)
            }
        } catch (err) {
            setError(err.message || 'Failed to create work order')
        } finally {
            setAccepting(false)
        }
    }

    const updateStatus = async (statusCode) => {
        if (!confirm(`Are you sure you want to ${statusCode.replace(/_/g, ' ')} this booking?`)) return
        setUpdating(true); setError('')
        try {
            const res = await fetch(`/api/bookings/${bookingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statusCode }),
            })
            const data = await res.json()
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update status')
            setSuccessMsg(`Booking ${statusCode.replace(/_/g, ' ')} successfully`)
            await loadBooking()
        } catch (err) {
            setError('Failed to update: ' + err.message)
        } finally {
            setUpdating(false)
        }
    }

    const sendMessage = async (e) => {
        e.preventDefault()
        if (!newMessage.trim()) return
        setSending(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const { data: profile } = await supabase
                .from('user_profiles').select('id').eq('auth_user_id', user.id).single()
            const { error: insertErr } = await supabase
                .from('booking_messages')
                .insert({ booking_id: bookingId, sender_user_id: profile.id, message: newMessage })
            if (insertErr) throw insertErr
            setNewMessage('')
            await loadMessages()
            await supabase.from('notifications').insert({
                user_id: booking.customer_user_id,
                recipient_user_id: booking.customer_user_id,
                notification_type: 'new_message',
                title: 'New Message',
                message: `New message on booking #${booking.booking_number}`,
                reference_id: bookingId,
                reference_type: 'booking',
                is_read: false,
            })
        } catch (err) {
            alert('Failed to send: ' + err.message)
        } finally {
            setSending(false)
        }
    }

    // ── 5. Render gates ────────────────────────────────────────────────────
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

    if (!booking) return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <button onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}/bookings`)}
                className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
                <ArrowLeft size={20} className="mr-2" /> Back to Bookings
            </button>
            <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
                <AlertCircle className="mx-auto text-red-600 mb-4" size={48} />
                <h2 className="text-xl font-semibold text-red-900 mb-2">Booking Not Found</h2>
                <p className="text-red-700 mb-4">{error || 'Booking not found'}</p>
                <button onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}/bookings`)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    View All Bookings
                </button>
            </div>
        </div>
    )

    const statusCode = booking.status?.code

    // ── 6. Render ──────────────────────────────────────────────────────────
    return (
        <div className="max-w-5xl mx-auto px-4 py-6">

            {/* Back link */}
            <button onClick={() => router.push(`/dashboard/my-teams/provider/${providerId}/bookings`)}
                className="flex items-center text-gray-600 hover:text-gray-900 mb-4">
                <ArrowLeft size={20} className="mr-2" /> Back to Bookings
            </button>

            {/* Member-role strip */}
            <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 mb-4">
                <span className="font-medium text-gray-700 truncate">{provider?.name}</span>
                <span>·</span>
                <span className="capitalize">{membership?.role?.replace(/_/g, ' ')}</span>
                {membership?.can_approve_work && (
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-semibold flex items-center gap-1">
                        <Shield size={9} /> WO access
                    </span>
                )}
                {isAssignedMechanic && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold">
                        Assigned to this WO
                    </span>
                )}
            </div>

            {/* Alerts */}
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}
            {successMsg && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                    <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
                    <p className="text-green-700 text-sm">{successMsg}</p>
                </div>
            )}

            {/* Work-order banner (only when a WO exists) */}
            {booking.work_order_id && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <ClipboardList className="text-blue-600 flex-shrink-0" size={20} />
                        <div>
                            <p className="font-medium text-blue-900 text-sm">
                                Work order linked
                                {woAssignment.work_order_number && ` · ${woAssignment.work_order_number}`}
                            </p>
                            <p className="text-blue-700 text-xs mt-0.5">
                                {canManageWO
                                    ? 'You can manage diagnostics, parts, services, and invoicing in the work order'
                                    : 'Only the assigned mechanic, an admin or an accountant can manage this work order'}
                            </p>
                        </div>
                    </div>
                    {canManageWO ? (
                        <button
                            onClick={() => router.push(`/dashboard/my-teams/work-order/${booking.work_order_id}`)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex-shrink-0"
                        >
                            Open Work Order <ExternalLink size={14} />
                        </button>
                    ) : (
                        <button
                            disabled
                            title="Only admin/accountant or the assigned mechanic can open this work order"
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm font-medium flex-shrink-0 cursor-not-allowed"
                        >
                            <Lock size={13} /> Open Work Order
                        </button>
                    )}
                </div>
            )}

            {/* Booking Details */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <div className="flex justify-between items-start mb-6 gap-3 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">
                            Booking #{booking.booking_number}
                        </h1>
                        <StatusBadge status={booking.status} />
                    </div>
                    <div className="text-right text-sm text-gray-500">
                        <p>Created {new Date(booking.created_at).toLocaleDateString()}</p>
                        {booking.priority === 'urgent' && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                                URGENT
                            </span>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Customer</h3>
                        <p className="text-gray-700 font-medium mb-1">
                            {booking.customer?.first_name} {booking.customer?.last_name}
                        </p>
                        {booking.customer?.phone && (
                            <div className="flex items-center text-sm text-gray-600 mb-1">
                                <Phone size={14} className="mr-2" /> {booking.customer.phone}
                            </div>
                        )}
                        {booking.customer?.email && (
                            <div className="flex items-center text-sm text-gray-600">
                                <Mail size={14} className="mr-2" /> {booking.customer.email}
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Appointment</h3>
                        <div className="flex items-start text-gray-700">
                            <Calendar size={14} className="mr-2 mt-1 flex-shrink-0" />
                            <div>
                                <p>{new Date(booking.booking_date).toLocaleDateString('en-KE', {
                                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                })}</p>
                                <p className="text-sm text-gray-600">
                                    {booking.booking_time_start} – {booking.booking_time_end}
                                </p>
                            </div>
                        </div>
                    </div>

                    {booking.shop && (
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-3">Location</h3>
                            <div className="flex items-start text-gray-700">
                                <MapPin size={14} className="mr-2 mt-1 flex-shrink-0" />
                                <div>
                                    <p>{booking.shop.name}</p>
                                    <p className="text-sm text-gray-600">
                                        {booking.shop.town}{booking.shop.county ? `, ${booking.shop.county}` : ''}
                                    </p>
                                    {booking.shop.street && (
                                        <p className="text-sm text-gray-600">{booking.shop.street}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Vehicle</h3>
                        <div className="flex items-start text-gray-700">
                            <Car size={14} className="mr-2 mt-1 flex-shrink-0" />
                            <div>
                                <p className="font-medium">{booking.vehicle?.plate_number}</p>
                                <p className="text-sm text-gray-600">
                                    {booking.vehicle?.make} {booking.vehicle?.model}
                                    {booking.vehicle?.year_of_manufacture
                                        ? ` · ${booking.vehicle.year_of_manufacture}` : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {booking.booking_services?.length > 0 && (
                    <div className="mt-6">
                        <h3 className="font-semibold text-gray-900 mb-3">Requested Services</h3>
                        <div className="flex flex-wrap gap-2">
                            {booking.booking_services.map((bs, idx) => (
                                <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                                    {bs.service?.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {booking.problem_description && (
                    <div className="mt-6">
                        <h3 className="font-semibold text-gray-900 mb-2">Problem Description</h3>
                        <p className="text-gray-700 bg-gray-50 p-4 rounded-lg text-sm">
                            {booking.problem_description}
                        </p>
                    </div>
                )}

                {booking.special_instructions && (
                    <div className="mt-6">
                        <h3 className="font-semibold text-gray-900 mb-2">Special Instructions</h3>
                        <p className="text-gray-700 bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-sm">
                            {booking.special_instructions}
                        </p>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>

                {/* Read-only note when nothing is permitted */}
                {!canAcceptBooking && !canManageWO && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-sm">
                        <Shield className="text-blue-600 flex-shrink-0 mt-0.5" size={14} />
                        <p className="text-blue-900">
                            You're viewing this booking as <strong className="capitalize">{membership?.role?.replace(/_/g, ' ')}</strong>.
                            {' '}Actions on this booking require <strong>WO access</strong> permission, an admin/accountant role,
                            or being the mechanic assigned to its work order.
                        </p>
                    </div>
                )}

                <div className="flex flex-wrap gap-3">
                    {/* Pending + no WO: Accept → Create WO */}
                    {statusCode === 'pending' && !booking.work_order_id && (
                        <>
                            {canAcceptBooking ? (
                                <button
                                    onClick={acceptAndCreateWorkOrder}
                                    disabled={accepting || updating}
                                    className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
                                >
                                    {accepting
                                        ? <><Loader2 size={15} className="animate-spin" /> Creating Work Order…</>
                                        : <><CheckCircle size={17} /> Accept &amp; Create Work Order</>}
                                </button>
                            ) : (
                                <button disabled
                                    title="Requires WO access permission, or admin/accountant role"
                                    className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-400 rounded-lg font-medium text-sm cursor-not-allowed">
                                    <Lock size={13} /> Accept &amp; Create Work Order
                                </button>
                            )}

                            {canAcceptBooking ? (
                                <button
                                    onClick={() => updateStatus('cancelled_provider')}
                                    disabled={accepting || updating}
                                    className="flex items-center gap-2 px-5 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium text-sm"
                                >
                                    <XCircle size={17} /> Reject Booking
                                </button>
                            ) : (
                                <button disabled
                                    title="Requires WO access permission, or admin/accountant role"
                                    className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-400 rounded-lg font-medium text-sm cursor-not-allowed">
                                    <Lock size={13} /> Reject Booking
                                </button>
                            )}
                        </>
                    )}

                    {/* Confirmed + no WO */}
                    {statusCode === 'confirmed' && !booking.work_order_id && (
                        canAcceptBooking ? (
                            <button
                                onClick={acceptAndCreateWorkOrder}
                                disabled={accepting || updating}
                                className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
                            >
                                {accepting
                                    ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
                                    : <><ClipboardList size={17} /> Create Work Order</>}
                            </button>
                        ) : (
                            <button disabled
                                title="Requires WO access permission, or admin/accountant role"
                                className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-400 rounded-lg font-medium text-sm cursor-not-allowed">
                                <Lock size={13} /> Create Work Order
                            </button>
                        )
                    )}

                    {/* WO exists — Manage button gated on canManageWO */}
                    {booking.work_order_id && (
                        canManageWO ? (
                            <button
                                onClick={() => router.push(`/dashboard/my-teams/work-order/${booking.work_order_id}`)}
                                className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                            >
                                <ClipboardList size={17} /> Manage Work Order
                            </button>
                        ) : (
                            <button disabled
                                title="Only admin/accountant or the assigned mechanic can manage this work order"
                                className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-400 rounded-lg font-medium text-sm cursor-not-allowed">
                                <Lock size={13} /> Manage Work Order
                            </button>
                        )
                    )}

                    {/* Legacy: in_progress without WO */}
                    {statusCode === 'in_progress' && !booking.work_order_id && (
                        canUpdateStatus ? (
                            <button
                                onClick={() => updateStatus('completed')}
                                disabled={updating}
                                className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
                            >
                                <Flag size={17} /> Mark Complete
                            </button>
                        ) : (
                            <button disabled
                                title="Requires WO access permission, or admin/accountant role"
                                className="flex items-center gap-2 px-5 py-3 bg-gray-100 text-gray-400 rounded-lg font-medium text-sm cursor-not-allowed">
                                <Lock size={13} /> Mark Complete
                            </button>
                        )
                    )}

                    {['completed', 'cancelled_provider', 'cancelled_customer', 'no_show'].includes(statusCode) && (
                        <p className="text-gray-500 text-sm py-3">
                            No further actions — booking is {booking.status?.display_name}.
                        </p>
                    )}
                </div>

                {/* Explanation shown only when accept action is available + permitted */}
                {statusCode === 'pending' && !booking.work_order_id && canAcceptBooking && (
                    <div className="mt-6 pt-5 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            What happens when you accept?
                        </p>
                        <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
                            <li>Booking status → <strong>Confirmed</strong></li>
                            <li>A <strong>Work Order</strong> is created (status: Intake)</li>
                            <li>Booking and work order are permanently linked</li>
                            <li>Customer receives a push notification + email + SMS</li>
                            <li>If you're admin/accountant or the assigned mechanic, you'll be taken to the work order</li>
                        </ol>
                    </div>
                )}
            </div>

            {/* Messages */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <MessageSquare size={20} /> Messages with Customer
                </h2>
                <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
                    {messages.length === 0
                        ? <p className="text-gray-500 text-center py-8 text-sm">No messages yet</p>
                        : messages.map(msg => (
                            <div key={msg.id} className="bg-gray-50 rounded-lg p-3">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-medium text-gray-900 text-sm">
                                        {msg.sender?.first_name} {msg.sender?.last_name}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {new Date(msg.created_at).toLocaleString()}
                                    </span>
                                </div>
                                <p className="text-gray-700 text-sm">{msg.message}</p>
                            </div>
                        ))
                    }
                </div>
                {canSendMessage ? (
                    <form onSubmit={sendMessage} className="flex gap-2">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            placeholder="Type a message to the customer…"
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button type="submit"
                            disabled={sending || !newMessage.trim()}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
                            {sending ? 'Sending…' : 'Send'}
                        </button>
                    </form>
                ) : (
                    <div className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                        <Lock className="text-gray-400 flex-shrink-0 mt-0.5" size={14} />
                        <p className="text-gray-600">
                            You can read the conversation but messaging customers requires the
                            <strong> Chat</strong> permission. Ask a team admin to enable it for you.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}