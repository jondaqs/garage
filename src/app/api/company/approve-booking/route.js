// src/app/api/company/approve-booking/route.js
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { bookingId, approved, notes } = await request.json();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Check if user is company admin
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, company_users!inner(is_admin)')
    .eq('auth_user_id', user.id)
    .single();
    
  if (!profile?.company_users?.[0]?.is_admin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  
  // Update booking status
  const newStatus = approved ? 'confirmed' : 'rejected';
  const { data: statusData } = await supabase
    .from('booking_statuses')
    .select('id')
    .eq('code', newStatus)
    .single();
  
  const { error } = await supabase
    .from('bookings')
    .update({
      status_id: statusData.id,
      confirmed_by_provider_user_id: profile.id,
      confirmed_by_provider_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
    
  if (error) throw error;
  
  // Create notification for customer
  const { data: booking } = await supabase
    .from('bookings')
    .select('customer_user_id, booking_number')
    .eq('id', bookingId)
    .single();
    
  await supabase
    .from('notifications')
    .insert({
      user_id: booking.customer_user_id,
      type: 'booking_status_update',
      title: `Booking ${approved ? 'Approved' : 'Rejected'}`,
      message: `Your booking ${booking.booking_number} has been ${approved ? 'approved' : 'rejected'}.`,
      data: { booking_id: bookingId },
    });
  
  return NextResponse.json({ success: true });
}