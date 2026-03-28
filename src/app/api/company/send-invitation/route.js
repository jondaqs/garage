// src/app/api/company/send-invitation/route.js
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
    const { email, phone, firstName, lastName } = await request.json();

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's company
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('company_id, company:company_profiles(name)')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Not associated with a company' }, { status: 400 });
    }

    // Create invitation link
    const invitationToken = Math.random().toString(36).substring(2, 15);
    const invitationLink = `${process.env.NEXT_PUBLIC_APP_URL}/company/join/${invitationToken}`;

    // Send email notification
    // In production, use a proper email service like SendGrid, AWS SES, etc.
    const emailContent = `
      <h2>You've been invited to join ${profile.company.name}</h2>
      <p>Hi ${firstName} ${lastName},</p>
      <p>You've been invited to join ${profile.company.name} on GariCare.</p>
      <p><a href="${invitationLink}">Click here to accept the invitation</a></p>
      <p>This invitation will expire in 7 days.</p>
    `;

    // For now, just log it
    console.log('Invitation email:', {
      to: email,
      subject: `Invitation to join ${profile.company.name}`,
      content: emailContent,
    });

    // Send SMS notification (optional)
    // In production, use SMS service like Twilio, Africa's Talking, etc.
    const smsContent = `You've been invited to join ${profile.company.name} on GariCare. Visit ${invitationLink} to accept.`;
    
    console.log('Invitation SMS:', {
      to: phone,
      content: smsContent,
    });

    return NextResponse.json({ 
      success: true,
      message: 'Invitation sent successfully',
    });

  } catch (error) {
    console.error('Error sending invitation:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to send invitation' 
    }, { status: 500 });
  }
}