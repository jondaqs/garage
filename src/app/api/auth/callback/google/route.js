// FILE LOCATION: src/app/api/auth/callback/google/route.js
// OAuth callback handler for Google Calendar integration

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')

  // User denied access
  if (error) {
    console.error('OAuth error:', error)
    return NextResponse.redirect(
      `${requestUrl.origin}/dashboard/settings?calendar=denied`
    )
  }

  // No authorization code
  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/dashboard/settings?calendar=error&msg=no_code`
    )
  }

  try {
    console.log('Exchanging authorization code for tokens...')

    // Exchange authorization code for access and refresh tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${requestUrl.origin}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Token exchange failed:', errorData)
      throw new Error(`Token exchange failed: ${errorData.error}`)
    }

    const tokens = await tokenResponse.json()
    console.log('Tokens received successfully')

    // Get Supabase client
    const supabase = createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('User not authenticated:', userError)
      return NextResponse.redirect(
        `${requestUrl.origin}/auth/login?error=unauthorized`
      )
    }

    console.log('Storing tokens for user:', user.id)

    // Store tokens in user_profiles table
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        google_calendar_token: tokens.access_token,
        google_calendar_refresh_token: tokens.refresh_token,
        google_calendar_token_expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
        google_calendar_auto_sync: true
      })
      .eq('auth_user_id', user.id)

    if (updateError) {
      console.error('Failed to store tokens:', updateError)
      throw updateError
    }

    console.log('Google Calendar connected successfully')

    // Redirect to settings page with success message
    return NextResponse.redirect(
      `${requestUrl.origin}/dashboard/settings?calendar=connected`
    )
  } catch (error) {
    console.error('Error in Google OAuth callback:', error)
    return NextResponse.redirect(
      `${requestUrl.origin}/dashboard/settings?calendar=error&msg=${encodeURIComponent(error.message)}`
    )
  }
}