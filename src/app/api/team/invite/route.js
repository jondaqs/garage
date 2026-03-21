// src/app/api/team/invite/route.js
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request) {
  try {
    const supabase = await createClient()
    
    const body = await request.json()
    const { email, role, specialization, experience_years } = body

    console.log('📨 Invite route called for:', email)

    // Validate email
    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      )
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }

    // Get service provider
    const { data: provider, error: providerError } = await supabase
      .from('service_providers')
      .select('id, name')
      .eq('owner_user_id', profile.id)
      .single()

    if (providerError) {
      return NextResponse.json(
        { error: 'Not a service provider' },
        { status: 403 }
      )
    }

    // Check for duplicate pending invitation
    const { data: existing } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('service_provider_id', provider.id)
      .eq('invited_email', email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Pending invitation already exists for this email' },
        { status: 400 }
      )
    }

    // Generate token
    const invitation_token = crypto.randomBytes(32).toString('base64url')

    // Create invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .insert({
        service_provider_id: provider.id,
        invited_email: email.toLowerCase(),
        invited_by_user_id: profile.id,
        role: role || 'mechanic',
        specialization: specialization || null,
        experience_years: parseInt(experience_years) || null,
        invitation_token,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      })
      .select()
      .single()

    if (inviteError) {
      console.error('Invite error:', inviteError)
      return NextResponse.json(
        { error: 'Failed to create invitation: ' + inviteError.message },
        { status: 500 }
      )
    }

    console.log('✅ Invitation created:', invitation.id)

    // ============================================
    // SEND EMAIL NOTIFICATION
    // ============================================
    
    // Get the current URL from request
    const url = new URL(request.url)
    const emailApiUrl = `${url.origin}/api/team/send-invitation-email`

    console.log('📧 Calling email API at:', emailApiUrl)
    console.log('📧 Invitation ID:', invitation.id)

    try {
      const emailResponse = await fetch(emailApiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          invitation_id: invitation.id 
        })
      })

      console.log('📧 Email API response status:', emailResponse.status)
      
      // Clone the response before reading to avoid "body already read" error
      const emailResponseClone = emailResponse.clone()
      
      // Check content type to determine how to parse
      const contentType = emailResponse.headers.get('content-type')
      let emailResult
      
      try {
        if (contentType && contentType.includes('application/json')) {
          emailResult = await emailResponse.json()
          console.log('📧 Email API result:', JSON.stringify(emailResult))
        } else {
          // Non-JSON response (probably HTML error page)
          const responseText = await emailResponseClone.text()
          console.error('❌ Email API returned non-JSON response')
          console.error('Content-Type:', contentType)
          console.error('Status:', emailResponse.status)
          console.error('Response (first 500 chars):', responseText.substring(0, 500))
          emailResult = { 
            error: 'Email API returned non-JSON response',
            status: emailResponse.status,
            contentType: contentType
          }
        }
      } catch (parseError) {
        console.error('❌ Failed to parse email response:', parseError.message)
        emailResult = { error: 'Failed to parse response' }
      }

      if (!emailResponse.ok) {
        console.error('❌ Email sending failed')
        // Don't fail the whole invitation if email fails
      } else {
        console.log('✅ Email notification sent successfully')
      }
    } catch (emailError) {
      console.error('❌ Error calling email API:', emailError.message)
      // Don't fail the whole invitation if email fails
    }

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.invited_email,
        status: invitation.status,
        expires_at: invitation.expires_at
      }
    })

  } catch (error) {
    console.error('💥 Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error: ' + error.message },
      { status: 500 }
    )
  }
}