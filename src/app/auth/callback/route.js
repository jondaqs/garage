import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/dashboard'
  const error = requestUrl.searchParams.get('error')
  const error_description = requestUrl.searchParams.get('error_description')

  if (error) {
    console.error('OAuth Error:', error, error_description)
    return NextResponse.redirect(
      new URL(`/auth/login?error=${error_description || error}`, request.url)
    )
  }

  if (!code) {
    console.error('No code in callback')
    return NextResponse.redirect(
      new URL('/auth/login?error=no_code', request.url)
    )
  }

  try {
    const supabase = await createClient()
    
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    
    if (exchangeError) {
      console.error('Exchange error:', exchangeError)
      throw exchangeError
    }

    console.log('Session exchanged successfully for user:', data?.user?.id)

    const user = data?.user
    
    if (user) {
      // Check if user profile exists
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      // If no profile, create one from OAuth data
      if (!profile || profileError) {
        console.log('Creating user profile for:', user.id)
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            auth_user_id: user.id,
            first_name: user.user_metadata.full_name?.split(' ')[0] || user.user_metadata.name?.split(' ')[0] || '',
            last_name: user.user_metadata.full_name?.split(' ').slice(1).join(' ') || user.user_metadata.name?.split(' ').slice(1).join(' ') || '',
            email: user.email,
            is_active: true
          })

        if (insertError) {
          console.error('Error creating profile:', insertError)
        }
      }

      // Check if this is a provider registration flow
      if (next.includes('provider-signup')) {
        console.log('Provider signup flow detected')
        
        // Get the profile (either existing or just created)
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()

        if (userProfile) {
          // Check if user already has a service provider account
          const { data: existingProvider } = await supabase
            .from('service_providers')
            .select('id, status')
            .eq('owner_user_id', userProfile.id)
            .single()

          if (existingProvider) {
            console.log('User already has provider account, redirecting to dashboard')
            // Already has provider account - go to provider dashboard
            if (existingProvider.status === 'active') {
              return NextResponse.redirect(new URL('/provider/dashboard', request.url))
            } else {
              // Pending verification
              return NextResponse.redirect(new URL('/provider/dashboard?status=pending', request.url))
            }
          }
        }
        
        // No provider account - continue with registration
        console.log('No provider account found, continuing registration')
        return NextResponse.redirect(new URL('/auth/provider-signup', request.url))
      }

      // Check user role and redirect appropriately for non-provider flows
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select(`
          id,
          user_roles(
            role:user_roles_lookup(code)
          )
        `)
        .eq('auth_user_id', user.id)
        .single()

      if (userProfile) {
        // Check if admin
        const isAdmin = userProfile.user_roles?.some(ur => ur.role?.code === 'admin')
        if (isAdmin) {
          return NextResponse.redirect(new URL('/admin/dashboard', request.url))
        }

        // Check if service provider
        const isProvider = userProfile.user_roles?.some(ur => ur.role?.code === 'service_provider_owner')
        if (isProvider) {
          return NextResponse.redirect(new URL('/provider/dashboard', request.url))
        }
      }

      // Default redirect based on 'next' parameter or fallback to dashboard
      return NextResponse.redirect(new URL(next, request.url))
    }

    // No user data - redirect to login
    return NextResponse.redirect(new URL('/auth/login', request.url))
    
  } catch (error) {
    console.error('OAuth Callback Error:', error.message)
    
    return NextResponse.redirect(
      new URL('/auth/login?error=oauth_callback_failed', request.url)
    )
  }
}
