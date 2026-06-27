// FILE LOCATION: src/app/api/auth/callback/google/route.js
// OAuth callback handler for Google Calendar integration
// SECURITY FIX: Tokens now stored in user_oauth_tokens (own-row RLS)
// instead of user_profiles (open SELECT policy)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Get Supabase server client (uses cookies for auth)
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      console.error('User not authenticated:', userError)
      return NextResponse.redirect(
        `${requestUrl.origin}/auth/login?error=unauthorized`
      )
    }

    // Get user profile ID (user_oauth_tokens uses profile ID, not auth ID)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('Profile not found:', profileError)
      throw new Error('User profile not found')
    }

    console.log('Storing tokens for user:', user.id)

    // Store tokens in user_oauth_tokens table (secured with own-row-only RLS)
    const { error: upsertError } = await supabase
      .from('user_oauth_tokens')
      .upsert({
        user_id: profile.id,
        google_calendar_token: tokens.access_token,
        google_calendar_refresh_token: tokens.refresh_token,
        google_calendar_token_expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
        google_calendar_auto_sync: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertError) {
      console.error('Failed to store tokens:', upsertError)
      throw upsertError
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
