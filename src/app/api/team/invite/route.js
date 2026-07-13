import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { sendInvitationEmail } from '@/lib/email/sendInvitationEmail'
import { piiHmac } from '@/lib/pii'
import { writeLimiter } from '@/lib/rateLimiters'
import { isValidEmail, requireNumber, sanitizeText } from '@/lib/validation'

export async function POST(request) {
  const limited = writeLimiter.check(request)
  if (limited) return limited

    try {
        const supabase = await createClient()

        const body = await request.json()
        const { email: rawEmail, role, specialization: rawSpec, experience_years: rawYears } = body
            const email = rawEmail?.trim()?.toLowerCase()
            if (!email || !isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
            const specialization = sanitizeText(rawSpec, 200)
            const experience_years = rawYears != null ? requireNumber(rawYears, { min: 0, max: 60, integer: true }) : null

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
            .from('user_profiles_secure')
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
            .from('service_providers_secure')
            .select('id, name')
            .eq('owner_user_id', profile.id)
            .single()

        if (providerError) {
            return NextResponse.json(
                { error: 'Not a service provider' },
                { status: 403 }
            )
        }

        // Check for duplicate pending invitation (PII: search by blind index)
        const emailIdx = await piiHmac(supabase, email)
        const { data: existing } = await supabase
            .from('team_invitations_secure')
            .select('id')
            .eq('service_provider_id', provider.id)
            .eq('invited_email_idx', emailIdx)
            .eq('status', 'pending')
            .maybeSingle()

        if (existing) {
            return NextResponse.json(
                { error: 'Pending invitation already exists for this email' },
                { status: 400 }
            )
        }

        // Check if user is already an active member of this provider.
        // Use email_idx (blind index) — avoids decrypting every row
        // in user_profiles, scales with table growth.
        const sc = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        const { data: existingProfile } = await sc
            .from('user_profiles')
            .select('id')
            .eq('email_idx', emailIdx)
            .maybeSingle()

        if (existingProfile) {
            const { data: existingMember } = await sc
                .from('service_provider_users')
                .select('id')
                .eq('service_provider_id', provider.id)
                .eq('user_id', existingProfile.id)
                .eq('is_active', true)
                .maybeSingle()

            if (existingMember) {
                return NextResponse.json(
                    { error: 'This user is already an active member of your team' },
                    { status: 400 }
                )
            }
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
                { error: 'Failed to create invitation' },
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
            const emailResponse = await sendInvitationEmail(invitation.id)

            console.log('📧 Email service response:', emailResponse)

            if (emailResponse.error) {
                console.error('❌ Email sending failed:', emailResponse.error)
            } else {
                console.log('✅ Email notification sent successfully')
            }

        } catch (emailError) {
            console.error('❌ Error sending email:', emailError.message)
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
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}