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
    
    // Construct the email API URL - FIX THE DOUBLE SLASH ISSUE
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host')
    
    // Build base URL without trailing slash
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL
    
    if (!baseUrl) {
      if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`
      } else {
        baseUrl = `${protocol}://${host}`
      }
    }
    
    // Remove trailing slash if present
    baseUrl = baseUrl.replace(/\/$/, '')
    
    // Construct email API URL (no double slash)
    const emailApiUrl = `${baseUrl}/api/team/send-invitation-email`

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
      
      // Try to parse response
      let emailResult
      try {
        emailResult = await emailResponse.json()
        console.log('📧 Email API result:', JSON.stringify(emailResult))
      } catch (parseError) {
        const responseText = await emailResponse.text()
        console.error('❌ Could not parse email response as JSON')
        console.error('Response text:', responseText.substring(0, 200))
        emailResult = { error: 'Invalid response format' }
      }

      if (!emailResponse.ok) {
        console.error('❌ Email sending failed:', emailResult)
        // Don't fail the whole invitation if email fails
      } else {
        console.log('✅ Email notification sent successfully')
      }
    } catch (emailError) {
      console.error('❌ Error calling email API:', emailError.message)
      console.error('Full error:', emailError)
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