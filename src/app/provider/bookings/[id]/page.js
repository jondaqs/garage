'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import {
    ArrowLeft, CheckCircle, XCircle, Flag, AlertCircle,
    Calendar, MapPin, Car, Phone, Mail, MessageSquare,
    ClipboardList, ExternalLink
} from 'lucide-react'
import StatusBadge from '@/components/bookings/StatusBadge'

export default function ManageBookingPage() {
    const router = useRouter()
    const params = useParams()
    const supabase = createClient()

    const [booking, setBooking] = useState(null)
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [loading, setLoading] = useState(true)
    const [updating, setUpdating] = useState(false)
    const [accepting, setAccepting] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [successMsg, setSuccessMsg] = useState('')

    useEffect(() => {
        if (params.id) {
            loadBooking()
            loadMessages()
        }
    }, [params.id])

    const loadBooking = async () => {
        try {
            setError('')
            const { data, error: fetchError } = await supabase
                .from('bookings')
                .select(`
          *,
          customer:user_profiles!customer_user_id(first_name, last_name, phone, email),
          shop:shops(name, town, county, street),
          vehicle:vehicles(plate_number, make, model, year_of_manufacture),
          status:booking_statuses(code, display_name, color_code),
          booking_services(service:services(name))
        `)
                .eq('id', params.id)
                .single()

            if (fetchError) { setError(fetchError.message || 'Failed to load booking'); return }
            if (!data) { setError('Booking not found'); return }
            setBooking(data)
        } catch {
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    const loadMessages = async () => {
        try {
            const { data } = await supabase
                .from('booking_messages')
                .select('*, sender:user_profiles(first_name, last_name)')
                .eq('booking_id', params.id)
                .order('created_at', { ascending: true })
            setMessages(data || [])
        } catch { }
    }

    // Accept booking and atomically create a work order via DB function
    const acceptAndCreateWorkOrder = async () => {
        if (!confirm('Accept this booking and create a work order?\nThe customer will be notified.')) return

        setAccepting(true)
        setError('')
        setSuccessMsg('')
        try {
            const { data: { user } } = await supabase.auth.getUser()

            const { data, error: fnError } = await supabase.rpc(
                'accept_booking_and_create_work_order',
                { p_booking_id: params.id, p_provider_user_id: user.id }
            )

            if (fnError) throw fnError
            if (!data.success) throw new Error(data.error)

            setSuccessMsg(`Work order ${data.work_order_number} created! Redirecting...`)
            await loadBooking()

            setTimeout(() => {
                router.push(`/provider/work-orders/${data.work_order_id}`)
            }, 1500)
        } catch (err) {
            setError(err.message || 'Failed to create work order')
        } finally {
            setAccepting(false)
        }
    }

    const updateStatus = async (statusCode) => {
        if (!confirm(`Are you sure you want to ${statusCode.replace(/_/g, ' ')} this booking?`)) return
        setUpdating(true)
        try {
            const { data: newStatus } = await supabase
                .from('booking_statuses').select('id').eq('code', statusCode).single()
            const { data: { user } } = await supabase.auth.getUser()
            const { data: profile } = await supabase
                .from('user_profiles').select('id').eq('auth_user_id', user.id).single()

            const patch = { status_id: newStatus.id, updated_at: new Date().toISOString() }
            if (statusCode === 'confirmed') {
                patch.confirmed_by_provider_at = new Date().toISOString()
                patch.confirmed_by_provider_user_id = profile.id
            }
            if (statusCode.startsWith('cancelled')) {
                patch.cancelled_at = new Date().toISOString()
                patch.cancelled_by_user_id = profile.id
            }

            const { error: upErr } = await supabase.from('bookings').update(patch).eq('id', params.id)
            if (upErr) throw upErr

            await supabase.from('notifications').insert({
                user_id: booking.customer_user_id,
                recipient_user_id: booking.customer_user_id,
                notification_type: `booking_${statusCode}`,
                title: `Booking ${statusCode.replace(/_/g, ' ')}`,
                message: `Your booking #${booking.booking_number} has been ${statusCode.replace(/_/g, ' ')}.`,
                reference_id: params.id,
                reference_type: 'booking',
                is_read: false
            })
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
                .insert({ booking_id: params.id, sender_user_id: profile.id, message: newMessage })
            if (insertErr) throw insertErr
            setNewMessage('')
            loadMessages()
            await supabase.from('notifications').insert({
                user_id: booking.customer_user_id, recipient_user_id: booking.customer_user_id,
                notification_type: 'new_message', title: 'New Message',
                message: `New message on booking #${booking.booking_number}`,
                reference_id: params.id, reference_type: 'booking', is_read: false
            })
        } catch (err) {
            alert('Failed to send: ' + err.message)
        } finally {
            setSending(false)
        }
    }

    if (loading) return (
        <div className="flex justify-center items-center min-h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
    )

    if (!booking) return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <button onClick={() => router.back()} className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
                <ArrowLeft size={20} className="mr-2" /> Back to Bookings
            </button>
            <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
                <AlertCircle className="mx-auto text-red-600 mb-4" size={48} />
                <h2 className="text-xl font-semibold text-red-900 mb-2">Booking Not Found</h2>
                <p className="text-red-700 mb-4">{error || 'Booking not found'}</p>
                <button onClick={() => router.push('/provider/bookings')}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    View All Bookings
                </button>
            </div>
        </div>
    )

    const statusCode = booking.status?.code

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <button onClick={() => router.back()} className="flex items-center text-gray-600 hover:text-gray-900 mb-6">
                <ArrowLeft size={20} className="mr-2" /> Back to Bookings
            </button>

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

            {/* Work order exists — prominent banner */}
            {booking.work_order_id && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <ClipboardList className="text-blue-600 flex-shrink-0" size={20} />
                        <div>
                            <p className="font-medium text-blue-900 text-sm">Work order linked to this booking</p>
                            <p className="text-blue-700 text-xs mt-0.5">
                                Manage diagnostics, parts, services, and invoicing in the work order
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push(`/provider/work-orders/${booking.work_order_id}`)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex-shrink-0"
                    >
                        Open Work Order <ExternalLink size={14} />
                    </button>
                </div>
            )}

            {/* Booking Details */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <div className="flex justify-between items-start mb-6">
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
                        <div className="flex items-center text-sm text-gray-600 mb-1">
                            <Phone size={14} className="mr-2" /> {booking.customer?.phone}
                        </div>
                        {booking.customer?.email && (
                            <div className="flex items-center text-sm text-gray-600">
                                <Mail size={14} className="mr-2" /> {booking.customer.email}
                            </div>
                        )}
                    </div>

                    {/* Appointment Info */}
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

                    {/* Location Info */}
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3">Location</h3>
                        <div className="flex items-start text-gray-700">
                            <MapPin size={14} className="mr-2 mt-1 flex-shrink-0" />
                            <div>
                                <p>{booking.shop?.name}</p>
                                <p className="text-sm text-gray-600">
                                    {booking.shop?.town}{booking.shop?.county ? `, ${booking.shop.county}` : ''}
                                </p>
                                {booking.shop?.street && (
                                    <p className="text-sm text-gray-600">{booking.shop.street}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Vehicle Info */}
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

                {/* Requested Services */}
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
                
                {/* Problem Description */}
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

                <div className="flex flex-wrap gap-3">
                    {/* Pending + no WO: primary action is Accept → Create WO */}
                    {statusCode === 'pending' && !booking.work_order_id && (
                        <>
                            <button
                                onClick={acceptAndCreateWorkOrder}
                                disabled={accepting || updating}
                                className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
                            >
                                {accepting
                                    ? <><span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Creating Work Order...</>
                                    : <><CheckCircle size={17} /> Accept &amp; Create Work Order</>}
                            </button>
                            <button
                                onClick={() => updateStatus('cancelled_provider')}
                                disabled={accepting || updating}
                                className="flex items-center gap-2 px-5 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium text-sm"
                            >
                                <XCircle size={17} /> Reject Booking
                            </button>
                        </>
                    )}

                    {/* Confirmed + no WO (edge case) */}
                    {statusCode === 'confirmed' && !booking.work_order_id && (
                        <button
                            onClick={acceptAndCreateWorkOrder}
                            disabled={accepting || updating}
                            className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
                        >
                            {accepting
                                ? <><span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Creating...</>
                                : <><ClipboardList size={17} /> Create Work Order</>}
                        </button>
                    )}

                    {/* WO exists */}
                    {booking.work_order_id && (
                        <button
                            onClick={() => router.push(`/provider/work-orders/${booking.work_order_id}`)}
                            className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                        >
                            <ClipboardList size={17} /> Manage Work Order
                        </button>
                    )}

                    {/* Legacy: in_progress without WO */}
                    {statusCode === 'in_progress' && !booking.work_order_id && (
                        <button
                            onClick={() => updateStatus('completed')}
                            disabled={updating}
                            className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
                        >
                            <Flag size={17} /> Mark Complete
                        </button>
                    )}

                    {['completed', 'cancelled_provider', 'cancelled_customer', 'no_show'].includes(statusCode) && (
                        <p className="text-gray-500 text-sm py-3">
                            No further actions — booking is {booking.status?.display_name}.
                        </p>
                    )}
                </div>

                {/* Explanation shown only when accept action is available */}
                {statusCode === 'pending' && !booking.work_order_id && (
                    <div className="mt-6 pt-5 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What happens when you accept?</p>
                        <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
                            <li>Booking status → <strong>Confirmed</strong></li>
                            <li>A <strong>Work Order</strong> is created (status: Intake)</li>
                            <li>Booking and work order are permanently linked</li>
                            <li>Customer receives a push notification</li>
                            <li>You are taken to the work order to begin diagnostics</li>
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
                        : messages.map((msg) => (
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
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message to the customer..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <button
                        type="submit"
                        disabled={sending || !newMessage.trim()}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                        {sending ? 'Sending...' : 'Send'}
                    </button>
                </form>
            </div>
        </div>
    )
}